import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { specialProfiles } from "@/lib/domain/access";
import { protectedAdminProfileId } from "@/lib/domain/resource-names";
import { database } from "./db";
import { ApiError } from "./http";

export async function headquarters(client?: PoolClient) {
  const { rows } = await (client ?? database()).query<{ id: string; nome: string }>(`
    SELECT id, data->>'nome' AS nome FROM icsv_records
    WHERE resource = 'congregacoes' AND deleted_at IS NULL AND data->>'ativo' = 'true'
      AND lower(data->>'nome') IN ('icsv san vale', 'sede campo san vale')
    ORDER BY (lower(data->>'nome') = 'icsv san vale') DESC, created_at, id LIMIT 1
  `);
  if (!rows[0]) throw new ApiError(409, "A sede ICSV San Vale ainda não está habilitada.");
  return rows[0];
}

export async function createExternalGuardian(
  client: PoolClient,
  { name, email, passwordHash }: { name: string; email: string; passwordHash: string },
) {
  const { id: congregationId } = await headquarters(client);
  const userId = randomUUID();
  await client.query(`
    INSERT INTO icsv_records (id, resource, congregation_id, data)
    VALUES ($1, 'usuarios', $2, $3)
  `, [userId, congregationId, { nome: name, email, congregacaoId: congregationId, ativo: true, perfilId: specialProfiles.guardian }]);
  await client.query("INSERT INTO icsv_credentials (user_id, password_hash) VALUES ($1, $2)", [userId, passwordHash]);
  await client.query("INSERT INTO icsv_managed_accounts (user_id, external_guardian) VALUES ($1, true)", [userId]);
  await client.query(`
    INSERT INTO icsv_access_assignments (user_id, profile_id, congregation_id) VALUES ($1, $2, $3)
  `, [userId, specialProfiles.guardian, congregationId]);
  await client.query(`
    INSERT INTO icsv_record_links (source_id, field, target_id, target_resource)
    VALUES ($1, 'perfilId', $2, 'perfis'), ($1, 'congregacaoId', $3, 'congregacoes')
  `, [userId, specialProfiles.guardian, congregationId]);
  return { userId, congregationId };
}

export async function grantKidsProfile(client: PoolClient, userId: string, congregationId: string) {
  const result = await client.query(`
    INSERT INTO icsv_managed_accounts (user_id) VALUES ($1) ON CONFLICT DO NOTHING
  `, [userId]);
  if (result.rowCount) {
    // Preserve the original profile and scope when a legacy member gains access to Kids.
    await client.query(`
      INSERT INTO icsv_access_assignments (user_id, profile_id, congregation_id)
      SELECT id, (data->>'perfilId')::uuid, congregation_id FROM icsv_records
      WHERE id = $1 AND resource = 'usuarios' AND data->>'perfilId' IS NOT NULL
    `, [userId]);
  }
  await client.query(`
    INSERT INTO icsv_access_assignments (user_id, profile_id, congregation_id)
    VALUES ($1, $2, $3) ON CONFLICT DO NOTHING
  `, [userId, specialProfiles.kids, congregationId]);
}

export async function isManagedAccount(client: PoolClient, userId: string) {
  const { rowCount } = await client.query("SELECT 1 FROM icsv_managed_accounts WHERE user_id = $1", [userId]);
  return Boolean(rowCount);
}

export async function managedAccessProfiles(client: PoolClient, userId: string) {
  const { rows } = await client.query<{ id: string; scope: "campo" | "congregacao"; grants: string[]; congregationId: string | null }>(`
    SELECT p.id, p.data->>'escopo' AS scope, p.data->'permissoes' AS grants, a.congregation_id AS "congregationId"
    FROM icsv_account_access a JOIN icsv_records p ON p.id = a.profile_id AND p.resource = 'perfis'
    WHERE a.user_id = $1
  `, [userId]);
  return rows;
}

export async function setUserAssignments(
  client: PoolClient, userId: string, profileIds: string[], congregationId: string,
) {
  await client.query("INSERT INTO icsv_managed_accounts (user_id) VALUES ($1) ON CONFLICT DO NOTHING", [userId]);
  await client.query("DELETE FROM icsv_access_assignments WHERE user_id = $1 AND profile_id <> $2", [userId, specialProfiles.kids]);
  await client.query(`
    INSERT INTO icsv_access_assignments (user_id, profile_id, congregation_id)
    SELECT $1, profile_id, $3 FROM unnest($2::uuid[]) AS profile_id ON CONFLICT DO NOTHING
  `, [userId, profileIds, congregationId]);
}

export function isSystemProfile(id: string) {
  return id === protectedAdminProfileId || (Object.values(specialProfiles) as string[]).includes(id);
}
