import { protectedAdminProfileId } from "@/lib/domain/resource-names";
import { specialProfiles } from "@/lib/domain/access";
import { headquarters } from "@/lib/server/access-admin";
import { assertGrant, requireUser } from "@/lib/server/auth";
import { database } from "@/lib/server/db";
import { ApiError, api } from "@/lib/server/http";

export function GET() {
  return api(async () => {
    const actor = await requireUser();
    assertGrant(actor, "usuarios:write");
    const congregation = await headquarters();
    if (actor.scope !== "campo" && congregation.id !== actor.congregacaoId) throw new ApiError(403, "A sede não está no seu escopo.");
    const { rows } = await database().query<{ id: string; nome: string; grants: string[] }>(`
      SELECT id, data->>'nome' AS nome, data->'permissoes' AS grants FROM icsv_records
      WHERE resource = 'perfis' AND deleted_at IS NULL AND data->>'ativo' = 'true'
        AND data->>'escopo' = 'congregacao' AND id NOT IN ($1, $2)
      ORDER BY nome
    `, [specialProfiles.guardian, specialProfiles.kids]);
    const profiles = rows
      .filter(({ grants }) => actor.profileId === protectedAdminProfileId || grants.every((grant) => actor.grants.has(grant)))
      .map(({ id, nome }) => ({ id, nome }));
    return Response.json({ congregation, profiles });
  });
}
