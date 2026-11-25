import { randomBytes, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { createExternalGuardian, grantKidsProfile, headquarters } from "./access-admin";
import { assertGrant, hashPassword, hashToken, requireUser, type Actor } from "./auth";
import { database, recordTransaction } from "./db";
import { ApiError } from "./http";
import { eligibleChild, kidsTerm } from "./kids-access";

const uuid = z.uuid("Identificador inválido.").toLowerCase();
const inviteCode = z.strictObject({
  codigo: z.string().trim().regex(/^[A-Za-z0-9_-]{32}$/, "Informe o código entregue pela ICSV."),
});
const register = z.strictObject({
  nome: z.string().trim().min(2, "Informe seu nome.").max(200),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email("Informe um e-mail válido.")),
  senha: z.string().min(8, "Use uma senha com pelo menos 8 caracteres.").max(128),
});

async function congregation(actor: Actor, client?: PoolClient) {
  if (actor.congregacaoId) return actor.congregacaoId;
  if (actor.scope === "campo") return (await headquarters(client)).id;
  throw new ApiError(403, "Selecione a congregação para continuar.");
}

function guardianScope(actor: Actor, client?: PoolClient) {
  if (actor.grants.has("kids:play")) throw new ApiError(403, "Troque de perfil para gerenciar seus vínculos.");
  return congregation(actor, client);
}

export async function registerGuardian(input: unknown) {
  const { nome, email, senha } = register.parse(input);
  const passwordHash = await hashPassword(senha);
  return recordTransaction((client) => createExternalGuardian(client, { name: nome, email, passwordHash }));
}

export async function getMyKidsLinks(actor: Actor) {
  const congregationId = await guardianScope(actor);
  const term = kidsTerm();
  const { rows } = await database().query<{
    id: string; status: string; crianca: string | null; solicitadoEm: Date;
    aceiteEm: Date | null; elegivel: boolean;
  }>(`
    SELECT l.id, l.status, l.requested_at AS "solicitadoEm",
      CASE WHEN l.status = 'confirmado' AND (${eligibleChild}) THEN p.data->>'nome' END AS crianca,
      a.accepted_at AS "aceiteEm",
      coalesce((${eligibleChild}), false) AS elegivel
    FROM icsv_kids_links l
    JOIN icsv_records p ON p.id = l.child_id AND p.congregation_id = l.congregation_id
    LEFT JOIN icsv_kids_acceptances a ON a.link_id = l.id AND a.guardian_id = l.guardian_id
      AND a.term_version = $3 AND a.term_hash = $4 AND a.demo = $5
    WHERE l.guardian_id = $1 AND l.congregation_id = $2
    ORDER BY l.requested_at DESC, l.id`, [actor.id, congregationId, term?.version, term?.hash, term?.demo]);
  return {
    termo: term && { versao: term.version, texto: term.text, demo: term.demo },
    vinculos: rows.map(({ elegivel, ...link }) => ({ ...link, habilitado: elegivel && link.status === "confirmado" && !!link.aceiteEm })),
  };
}

export async function getKidsAdministration(actor: Actor) {
  assertGrant(actor, "kids:manage");
  const scope = await congregation(actor);
  const [children, links] = await Promise.all([
    database().query<{ id: string; nome: string }>(`
      SELECT p.id, p.data->>'nome' AS nome FROM icsv_records p
      WHERE p.congregation_id = $1 AND (${eligibleChild}) ORDER BY p.data->>'nome', p.id`, [scope]),
    database().query(`
      SELECT l.id, l.status, l.requested_at AS "solicitadoEm", l.reviewed_at AS "revisadoEm",
        p.data->>'nome' AS crianca, u.data->>'nome' AS responsavel, u.data->>'email' AS email,
        l.guardian_id = $2 AS "proprioVinculo"
      FROM icsv_kids_links l
      JOIN icsv_records p ON p.id = l.child_id AND p.congregation_id = l.congregation_id
      JOIN icsv_records u ON u.id = l.guardian_id AND u.resource = 'usuarios'
      WHERE l.congregation_id = $1 ORDER BY l.requested_at DESC, l.id`, [scope, actor.id]),
  ]);
  return { criancas: children.rows, vinculos: links.rows };
}

export async function createKidsInvitation(input: unknown) {
  const { criancaId } = z.strictObject({ criancaId: uuid }).parse(input);
  const codigo = randomBytes(24).toString("base64url");
  const codeHash = hashToken(codigo);
  const expires = await recordTransaction(async (client) => {
    const actor = await requireUser(client);
    assertGrant(actor, "kids:manage");
    const scope = await congregation(actor, client);
    const { rows } = await client.query<{ expires_at: Date }>(`
      INSERT INTO icsv_kids_invites (id, congregation_id, child_id, created_by, code_hash, expires_at)
      SELECT $1, p.congregation_id, p.id, $2, $3, now() + interval '72 hours' FROM icsv_records p
      WHERE p.id = $4 AND p.congregation_id = $5 AND (${eligibleChild})
      RETURNING expires_at`, [randomUUID(), actor.id, codeHash, criancaId, scope]);
    if (!rows[0]) throw new ApiError(404, "Cadastro infantil ativo não encontrado.");
    return rows[0].expires_at;
  });
  return { codigo, expiraEm: expires.toISOString() };
}

export async function requestKidsLink(input: unknown) {
  const { codigo } = inviteCode.parse(input);
  await recordTransaction(async (client) => {
    const actor = await requireUser(client);
    const scope = await guardianScope(actor, client);
    const { rows } = await client.query<{ id: string; child_id: string }>(`
      UPDATE icsv_kids_invites i SET used_at = now()
      FROM icsv_records p
      WHERE i.code_hash = $1 AND i.congregation_id = $2 AND i.used_at IS NULL AND i.expires_at > now()
        AND p.id = i.child_id AND p.congregation_id = i.congregation_id AND (${eligibleChild})
      RETURNING i.id, i.child_id`, [hashToken(codigo), scope]);
    const invite = rows[0];
    if (!invite) throw new ApiError(400, "Código inválido, expirado ou já utilizado. Solicite outro código à administração.");
    await client.query(`
      INSERT INTO icsv_kids_links (id, congregation_id, child_id, guardian_id, invite_id, status)
      VALUES ($1, $2, $3, $4, $5, 'pendente')`, [randomUUID(), scope, invite.child_id, actor.id, invite.id]);
  });
}

const reviewActions = { confirmar: "confirmado", rejeitar: "rejeitado", revogar: "revogado" } as const;

export async function reviewKidsLink(linkId: string, input: unknown) {
  const id = uuid.parse(linkId);
  const { acao } = z.strictObject({ acao: z.enum(["confirmar", "rejeitar", "revogar"]) }).parse(input);
  await recordTransaction(async (client) => {
    const actor = await requireUser(client);
    assertGrant(actor, "kids:manage");
    const scope = await congregation(actor, client);
    const { rowCount } = await client.query(`
      UPDATE icsv_kids_links l
      SET status = $1, reviewed_at = now(), reviewed_by = $2
      FROM icsv_records p, icsv_records u
      WHERE l.id = $3 AND l.congregation_id = $4 AND l.status = $5
        AND p.id = l.child_id AND p.congregation_id = l.congregation_id
        AND u.id = l.guardian_id AND u.resource = 'usuarios'
        AND ($1 <> 'confirmado' OR (l.guardian_id <> $2 AND (${eligibleChild})
          AND u.deleted_at IS NULL AND u.data->>'ativo' = 'true'))`,
    [reviewActions[acao], actor.id, id, scope, acao === "revogar" ? "confirmado" : "pendente"]);
    if (rowCount !== 1) throw new ApiError(409, "Vínculo indisponível para esta revisão. Confira o estado e a autorização.");
  });
}

export async function withdrawKidsLink(linkId: string) {
  const id = uuid.parse(linkId);
  await recordTransaction(async (client) => {
    const actor = await requireUser(client);
    const scope = await guardianScope(actor, client);
    const { rowCount } = await client.query(`
      UPDATE icsv_kids_links SET status = 'revogado', reviewed_at = now(), reviewed_by = $2
      WHERE id = $1 AND guardian_id = $2 AND congregation_id = $3
        AND status IN ('pendente', 'confirmado')`, [id, actor.id, scope]);
    if (rowCount !== 1) throw new ApiError(404, "Vínculo ativo não encontrado.");
  });
}

export async function acceptKidsTerm(linkId: string, input: unknown) {
  const id = uuid.parse(linkId);
  const { versao } = z.strictObject({ aceite: z.literal(true), versao: z.string().max(96) }).parse(input);
  const term = kidsTerm();
  if (!term || versao !== term.version) {
    throw new ApiError(409, "O termo vigente está indisponível ou foi alterado. Recarregue para consultar.");
  }

  await recordTransaction(async (client) => {
    const actor = await requireUser(client);
    const scope = await guardianScope(actor, client);
    const { rowCount } = await client.query(`
      SELECT 1 FROM icsv_kids_links l
      JOIN icsv_records p ON p.id = l.child_id AND p.congregation_id = l.congregation_id
      WHERE l.id = $1 AND l.guardian_id = $2 AND l.congregation_id = $3 AND l.status = 'confirmado'
        AND (${eligibleChild})`, [id, actor.id, scope]);
    if (rowCount !== 1) throw new ApiError(409, "O aceite exige um vínculo confirmado para esta conta.");
    await client.query(`
      INSERT INTO icsv_kids_acceptances (
        link_id, term_version, term_hash, guardian_id, guardian_name, guardian_email, demo
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (link_id, term_version, term_hash) DO NOTHING`,
    [id, term.version, term.hash, actor.id, actor.name, actor.email, term.demo]);
    await grantKidsProfile(client, actor.id, scope);
  });
}
