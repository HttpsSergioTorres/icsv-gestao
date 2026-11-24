import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { type PoolClient } from "pg";
import { database, recordTransaction } from "./db";
import { ApiError } from "./http";
import { resourceNames, type ResourceName } from "@/lib/domain/resources";

const deriveKey = promisify(scrypt);
const sessionCookie = "icsv_session";
const sessionLifetimeSeconds = 60 * 60 * 12;
const fakeHash = "00000000000000000000000000000000:" + "00".repeat(64);

export type Actor = {
  id: string;
  name: string;
  email: string;
  role: string;
  profileId: string;
  scope: "campo" | "congregacao";
  congregacaoId: string | null;
  grants: Set<string>;
};

type AccountRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  profile_id: string;
  scope: Actor["scope"];
  congregation_id: string | null;
  grants: string[];
  password_hash: string;
};

const accounts = `
  SELECT u.id, u.data->>'nome' AS name, u.data->>'email' AS email,
    p.data->>'nome' AS role, p.id AS profile_id, p.data->>'escopo' AS scope,
    u.congregation_id, p.data->'permissoes' AS grants, cred.password_hash
  FROM icsv_records u
  JOIN icsv_credentials cred ON cred.user_id = u.id
  JOIN icsv_records p ON p.id = (u.data->>'perfilId')::uuid AND p.resource = 'perfis'
  LEFT JOIN icsv_records c ON c.id = u.congregation_id
  WHERE u.resource = 'usuarios' AND u.deleted_at IS NULL AND u.data->>'ativo' = 'true'
    AND p.deleted_at IS NULL AND p.data->>'ativo' = 'true'
    AND (p.data->>'escopo' = 'campo' OR
      (c.resource = 'congregacoes' AND c.deleted_at IS NULL AND c.data->>'ativo' = 'true'))
`;

function toActor(row: AccountRow): Actor {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    profileId: row.profile_id,
    scope: row.scope,
    congregacaoId: row.congregation_id,
    grants: new Set(row.grants),
  };
}

export function publicUser(actor: Actor) {
  return {
    id: actor.id,
    name: actor.name,
    email: actor.email,
    role: actor.role,
    profileId: actor.profileId,
    scope: actor.scope,
    congregacaoId: actor.congregacaoId,
    permissions: Object.fromEntries(resourceNames.map((name) => [name, {
      read: actor.grants.has(`${name}:read`),
      write: actor.grants.has(`${name}:write`),
    }])),
    canViewDashboard: actor.grants.has("dashboard:read"),
    canViewReports: actor.grants.has("reports:read"),
  };
}

export function assertGrant(actor: Actor, grant: string) {
  if (!actor.grants.has(grant)) throw new ApiError(403, "Você não tem permissão para esta operação.");
}

export function hasAccess(actor: Actor, resource: ResourceName, action: "read" | "write") {
  return actor.grants.has(`${resource}:${action}`);
}

export function assertCanManageProfile(
  actor: Actor,
  data: { escopo: string; permissoes: string[] },
) {
  if (actor.scope === "congregacao" && data.escopo !== "congregacao") {
    throw new ApiError(403, "O perfil precisa ter escopo de congregação.");
  }

  if (data.permissoes.some((permission) => !actor.grants.has(permission))) {
    throw new ApiError(403, "Este perfil possui permissões que sua conta não pode administrar.");
  }
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = await deriveKey(password, salt, 64) as Buffer;
  return `${salt}:${key.toString("hex")}`;
}

async function verifyPassword(password: string, storedHash: string) {
  const [salt, hash] = storedHash.split(":");
  const stored = Buffer.from(hash, "hex");
  const computed = await deriveKey(password, salt, 64) as Buffer;
  return stored.length === computed.length && timingSafeEqual(stored, computed);
}

function cookieOptions() {
  const secure = process.env.SESSION_COOKIE_SECURE === undefined
    ? process.env.NODE_ENV === "production"
    : process.env.SESSION_COOKIE_SECURE === "true";
  return { httpOnly: true, sameSite: "lax", secure, path: "/" } as const;
}

async function getSessionAccount(client?: PoolClient) {
  const token = (await cookies()).get(sessionCookie)?.value;
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;

  const { rows } = await (client ?? database()).query<AccountRow>(`
    ${accounts} AND EXISTS (
      SELECT 1 FROM icsv_sessions s
      WHERE s.user_id = u.id AND s.token_hash = $1 AND s.expires_at > now()
    )
  `, [hashToken(token)]);
  return rows[0] ?? null;
}

export async function getUser(client?: PoolClient) {
  const account = await getSessionAccount(client);
  return account ? toActor(account) : null;
}

export async function requireUser(client?: PoolClient) {
  const user = await getUser(client);
  if (!user) throw new ApiError(401, "Entre na sua conta para continuar.");
  return user;
}

async function trackPasswordAttempt(key: string) {
  const pool = database();
  await pool.query("DELETE FROM icsv_login_attempts WHERE window_start < now() - interval '1 day'");
  const { rows } = await pool.query<{ attempts: number }>(`
    INSERT INTO icsv_login_attempts AS a (email_hash, attempts, window_start)
    VALUES ($1, 1, now())
    ON CONFLICT (email_hash) DO UPDATE SET
      attempts = CASE WHEN a.window_start < now() - interval '1 minute' THEN 1 ELSE a.attempts + 1 END,
      window_start = CASE WHEN a.window_start < now() - interval '1 minute' THEN now() ELSE a.window_start END
    RETURNING attempts
  `, [hashToken(key)]);
  if (rows[0].attempts > 12) {
    throw new ApiError(429, "Muitas tentativas de acesso. Tente novamente em instantes.");
  }
}

export async function login(email: string, password: string) {
  await trackPasswordAttempt(email);
  const { rows } = await database().query<AccountRow>(`
    ${accounts} AND lower(u.data->>'email') = $1
  `, [email]);
  const row = rows[0];
  const valid = await verifyPassword(password, row?.password_hash ?? fakeHash);
  if (!valid || !row) throw new ApiError(401, "E-mail ou senha inválidos.");

  const token = randomBytes(32).toString("hex");
  const account = await recordTransaction(async (client) => {
    const { rows: current } = await client.query<AccountRow>(`
      ${accounts} AND u.id = $1 FOR UPDATE OF cred
    `, [row.id]);
    if (!current[0] || current[0].email !== row.email || current[0].password_hash !== row.password_hash) {
      throw new ApiError(401, "E-mail ou senha inválidos.");
    }

    await client.query("DELETE FROM icsv_sessions WHERE expires_at <= now()");
    await client.query(`
      INSERT INTO icsv_sessions (token_hash, user_id, expires_at)
      VALUES ($1, $2, now() + $3 * interval '1 second')
    `, [hashToken(token), row.id, sessionLifetimeSeconds]);
    await client.query("DELETE FROM icsv_login_attempts WHERE email_hash = $1", [hashToken(email)]);
    return current[0];
  });

  (await cookies()).set(sessionCookie, token, { ...cookieOptions(), maxAge: sessionLifetimeSeconds });
  return toActor(account);
}

export async function logout() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookie)?.value;
  if (token) await database().query("DELETE FROM icsv_sessions WHERE token_hash = $1", [hashToken(token)]);
  cookieStore.set(sessionCookie, "", { ...cookieOptions(), maxAge: 0 });
}

export async function updatePassword(client: PoolClient, id: string, passwordHash: string) {
  await client.query(`
    INSERT INTO icsv_credentials (user_id, password_hash)
    VALUES ($1, $2)
    ON CONFLICT (user_id) DO UPDATE SET password_hash = EXCLUDED.password_hash
  `, [id, passwordHash]);
  await client.query("DELETE FROM icsv_sessions WHERE user_id = $1", [id]);
  await client.query("DELETE FROM icsv_recovery WHERE user_id = $1", [id]);
}

export async function changeOwnPassword(currentPassword: string, newPassword: string) {
  const account = await getSessionAccount();
  if (!account) throw new ApiError(401, "Entre na sua conta para continuar.");

  const attemptKey = `password-change:${account.id}`;
  await trackPasswordAttempt(attemptKey);
  if (!await verifyPassword(currentPassword, account.password_hash)) {
    throw new ApiError(400, "A senha atual está incorreta.");
  }
  if (currentPassword === newPassword) {
    throw new ApiError(400, "Escolha uma senha diferente da atual.");
  }

  const passwordHash = await hashPassword(newPassword);
  await recordTransaction(async (client) => {
    const current = await getSessionAccount(client);
    if (current?.id !== account.id || current.password_hash !== account.password_hash) {
      throw new ApiError(401, "Sua sessão mudou. Entre novamente para continuar.");
    }
    await updatePassword(client, account.id, passwordHash);
    await client.query("DELETE FROM icsv_login_attempts WHERE email_hash = $1", [hashToken(attemptKey)]);
  });
  (await cookies()).set(sessionCookie, "", { ...cookieOptions(), maxAge: 0 });
}

export async function issueRecovery(email: string) {
  return recordTransaction(async (client) => {
    const actor = await requireUser(client);
    assertGrant(actor, "usuarios:write");
    if (actor.email.toLowerCase() === email) {
      throw new ApiError(400, "Peça a outro administrador para gerar seu código de acesso.");
    }
    const { rows } = await client.query<AccountRow>(`
      ${accounts} AND lower(u.data->>'email') = $1 FOR UPDATE OF cred
    `, [email]);
    const row = rows[0];
    if (!row || (actor.scope === "congregacao" && actor.congregacaoId !== row.congregation_id)) {
      throw new ApiError(404, "Conta ativa não encontrada.");
    }

    assertCanManageProfile(actor, { escopo: row.scope, permissoes: row.grants });
    const token = randomBytes(24).toString("base64url");
    const { rows: recovery } = await client.query<{ expires_at: Date }>(`
      INSERT INTO icsv_recovery (token_hash, user_id, expires_at)
      VALUES ($1, $2, now() + interval '30 minutes')
      ON CONFLICT (user_id) DO UPDATE SET
        token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at
      RETURNING expires_at
    `, [hashToken(token), row.id]);
    return { token, expiresAt: recovery[0].expires_at.toISOString() };
  });
}

export async function resetPassword(token: string, password: string) {
  const tokenHash = hashToken(token);
  const match = await database().query<{ user_id: string }>(`
    SELECT user_id FROM icsv_recovery WHERE token_hash = $1 AND expires_at > now()
  `, [tokenHash]);
  const id = match.rows[0]?.user_id;
  if (!id) throw new ApiError(400, "Código inválido ou expirado.");

  const passwordHash = await hashPassword(password);
  await recordTransaction(async (client) => {
    await client.query("SELECT user_id FROM icsv_credentials WHERE user_id = $1 FOR UPDATE", [id]);
    const { rowCount } = await client.query(`
      DELETE FROM icsv_recovery WHERE token_hash = $1 AND user_id = $2 AND expires_at > now()
    `, [tokenHash, id]);
    if (!rowCount) throw new ApiError(400, "Código inválido ou expirado.");
    await updatePassword(client, id, passwordHash);
  });
}
