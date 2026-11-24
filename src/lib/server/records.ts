import { randomUUID } from "node:crypto";
import { type PoolClient } from "pg";
import { z } from "zod";
import { eventTime, iterateOccurrences, type RecurringEvent } from "@/lib/domain/occurrences";
import { getResourceSchema, isResourceName, resources, type ResourceName } from "@/lib/domain/resources";
import { assertCanManageProfile, assertGrant, hashPassword, requireUser, updatePassword, type Actor } from "./auth";
import { database, recordTransaction } from "./db";
import { ApiError } from "./http";

export type Item = { id: string; [key: string]: unknown };
type RecordData = Record<string, unknown>;
type ResourceRow = {
  id: string;
  resource: ResourceName;
  congregation_id: string | null;
  data: RecordData;
  created_at: Date;
  updated_at: Date;
};
const protectedProfile = "10000000-0000-4000-8000-000000000001";
const uuid = z.uuid("Identificador inválido.");

export function resourceName(name: string): ResourceName {
  if (!isResourceName(name)) throw new ApiError(404, "Cadastro não encontrado.");
  return name;
}

export function recordId(id: string) {
  const parsed = uuid.safeParse(id);
  if (!parsed.success) throw new ApiError(404, "Registro não encontrado.");
  return parsed.data.toLowerCase();
}

function item(row: ResourceRow): Item {
  return {
    ...row.data,
    id: row.id,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function getScopeCondition(actor: Actor, resource: ResourceName, params: unknown[]) {
  if (actor.scope === "campo") return "TRUE";
  if (resource === "perfis") {
    params.push(JSON.stringify([...actor.grants]));
    return `data->>'escopo' = 'congregacao' AND data->'permissoes' <@ $${params.length}::jsonb`;
  }

  params.push(actor.congregacaoId);
  const scope = resource === "congregacoes" ? "id" : "congregation_id";
  if (resource === "usuarios") {
    return `${scope} = $${params.length} AND EXISTS (
      SELECT 1 FROM icsv_records p WHERE p.id = (icsv_records.data->>'perfilId')::uuid
        AND p.data->>'escopo' = 'congregacao'
    )`;
  }
  return `${scope} = $${params.length}`;
}

export async function listRecords(actor: Actor, resource: ResourceName, congregationId?: string) {
  const params: unknown[] = [resource];
  const scope = getScopeCondition(actor, resource, params);
  let filter = "TRUE";
  if (congregationId && resource !== "perfis") {
    params.push(recordId(congregationId));
    filter = `${resource === "congregacoes" ? "id" : "congregation_id"} = $${params.length}`;
  }
  const { rows } = await database().query<ResourceRow>(`
    SELECT * FROM icsv_records
    WHERE resource = $1 AND deleted_at IS NULL AND (${scope}) AND (${filter})
    ORDER BY created_at, id
  `, params);
  return rows.map(item);
}

async function findRecord(
  actor: Actor,
  resource: ResourceName,
  id: string,
  client?: PoolClient,
  includeDeleted = false,
) {
  const params: unknown[] = [recordId(id), resource];
  const scope = getScopeCondition(actor, resource, params);
  const { rows } = await (client ?? database()).query<ResourceRow>(`
    SELECT * FROM icsv_records WHERE id = $1 AND resource = $2
    AND (${scope}) AND ($${params.length + 1}::boolean OR deleted_at IS NULL)
  `, [...params, includeDeleted]);
  if (!rows[0]) throw new ApiError(404, "Registro não encontrado.");
  return rows[0];
}

export async function getRecord(actor: Actor, resource: ResourceName, id: string) {
  assertGrant(actor, `${resource}:read`);
  return item(await findRecord(actor, resource, id));
}

function assertWrite(actor: Actor, resource: ResourceName) {
  assertGrant(actor, `${resource}:write`);
  if (actor.scope === "congregacao" && resource === "perfis") {
    throw new ApiError(403, "A gestão dos perfis compartilhados exige escopo de campo.");
  }
}

async function mutate<T>(
  resource: ResourceName,
  action: (client: PoolClient, actor: Actor) => Promise<T>,
) {
  return recordTransaction(async (client) => {
    const actor = await requireUser(client);
    assertWrite(actor, resource);
    return action(client, actor);
  });
}

async function profile(client: PoolClient, id: unknown) {
  const { rows } = await client.query<ResourceRow>(`
    SELECT * FROM icsv_records WHERE id = $1 AND resource = 'perfis' AND deleted_at IS NULL
  `, [id]);
  if (!rows[0]) throw new ApiError(404, "Perfil não encontrado.");
  return rows[0];
}

function verifyProfile(actor: Actor, data: RecordData) {
  assertCanManageProfile(actor, {
    escopo: String(data.escopo),
    permissoes: data.permissoes as string[],
  });
}

async function prepareRecord(
  client: PoolClient,
  actor: Actor,
  resource: ResourceName,
  id: string,
  data: RecordData,
  previous?: ResourceRow,
) {
  const field = resources[resource].congregationField;
  const congregationId = field && typeof data[field] === "string" ? data[field].toLowerCase() : null;
  if (field) data[field] = congregationId;
  if (actor.scope === "congregacao" && congregationId !== actor.congregacaoId && resource !== "congregacoes") {
    throw new ApiError(404, "Congregação não encontrada.");
  }

  if (resource === "usuarios") {
    const current = await profile(client, data.perfilId);
    verifyProfile(actor, current.data);
    if (current.data.escopo === "congregacao" && !congregationId) {
      throw new ApiError(400, "Selecione a congregação para este perfil.");
    }
    if (id === actor.id && (data.ativo !== true || data.perfilId !== actor.profileId ||
        congregationId !== actor.congregacaoId)) {
      throw new ApiError(403, "Outra conta administrativa precisa alterar estas opções da sua conta.");
    }
    if (previous) verifyProfile(actor, (await profile(client, previous.data.perfilId)).data);
  }

  if (resource === "perfis") {
    verifyProfile(actor, data);
    if (previous) verifyProfile(actor, previous.data);
    if (id === protectedProfile || id === actor.profileId) {
      throw new ApiError(403, "Este perfil não pode ser alterado pela sua conta.");
    }
    if (previous && previous.data.escopo !== data.escopo) {
      await ensureUnreferenced(client, id, "Remova o vínculo das contas antes de alterar o escopo.");
    }
  }

  if (previous && previous.congregation_id !== congregationId) {
    await ensureUnreferenced(client, id, "O registro possui vínculos e sua congregação não pode ser alterada.");
  }

  const links: { field: string; target: ResourceRow }[] = [];
  for (const field of resources[resource].fields) {
    if (!field.reference || typeof data[field.key] !== "string") continue;
    const value = recordId(data[field.key] as string);
    data[field.key] = value;
    const target = await findRecord(actor, field.reference, value, client);
    const expected = resource === "congregacoes" ? id : congregationId;
    const actual = target.resource === "congregacoes" ? target.id : target.congregation_id;
    if (expected && actual && expected !== actual) {
      throw new ApiError(400, "Os registros relacionados devem pertencer à mesma congregação.");
    }
    if (previous?.data[field.key] !== value &&
        (target.data.ativo === false || (target.resource === "eventos" && target.data.status === "cancelado"))) {
      throw new ApiError(400, "Selecione um registro ativo para o vínculo.");
    }
    links.push({ field: field.key, target });
  }

  const related = Object.fromEntries(links.map(({ field, target }) => [field, target]));
  await validateBusinessRules(client, resource, id, data, related, previous);
  return { congregationId, links };
}

async function ensureUnreferenced(client: PoolClient, id: string, message: string) {
  const { rowCount } = await client.query(`
    SELECT 1 FROM icsv_record_links l JOIN icsv_records r ON r.id = l.source_id
    WHERE l.target_id = $1 AND r.deleted_at IS NULL LIMIT 1
  `, [id]);
  if (rowCount) throw new ApiError(409, message);
}

function asEvent(data: RecordData): RecurringEvent {
  return data as unknown as RecurringEvent;
}

function overlaps(left: RecurringEvent, right: RecurringEvent) {
  const first = iterateOccurrences(left, new Date(eventTime(right.inicio)));
  const second = iterateOccurrences(right, new Date(eventTime(left.inicio)));
  let a = first.next();
  let b = second.next();
  while (!a.done && !b.done) {
    const leftEnd = eventTime(a.value.fim);
    const rightEnd = eventTime(b.value.fim);
    if (eventTime(a.value.inicio) < rightEnd && eventTime(b.value.inicio) < leftEnd) return true;
    if (leftEnd <= rightEnd) a = first.next();
    else b = second.next();
  }
  return false;
}

async function verifySchedule(client: PoolClient, id: string, personId: unknown, event: RecordData) {
  if (event.status === "cancelado") return;

  const { rows } = await client.query<{ data: RecordData }>(`
    SELECT e.data FROM icsv_records s
    JOIN icsv_records e ON e.id = (s.data->>'eventoId')::uuid
    WHERE s.resource = 'escalas' AND s.deleted_at IS NULL AND s.id <> $1
      AND s.data->>'pessoaId' = $2 AND s.data->>'status' IN ('pendente', 'confirmada')
      AND e.deleted_at IS NULL AND e.data->>'status' <> 'cancelado'
  `, [id, personId]);

  if (rows.some((row) => overlaps(asEvent(event), asEvent(row.data)))) {
    throw new ApiError(409, "A pessoa já possui uma escala com conflito neste horário.");
  }
}

async function validateBusinessRules(
  client: PoolClient,
  resource: ResourceName,
  id: string,
  data: RecordData,
  related: Record<string, ResourceRow>,
  previous?: ResourceRow,
) {
  if (resource === "movimentacoes") {
    if (data.tipo !== related.categoriaId.data.tipo) {
      throw new ApiError(400, "A categoria deve corresponder ao tipo de movimentação.");
    }
    const proof = typeof data.comprovante === "string" && data.comprovante.match(/^\/api\/comprovantes\/(.+)$/);
    if (proof) {
      const { rowCount } = await client.query(`
        SELECT 1 FROM icsv_receipts WHERE id = $1 AND congregation_id = $2
      `, [recordId(proof[1]), data.congregacaoId]);
      if (!rowCount) throw new ApiError(404, "Comprovante não encontrado.");
    }
  }

  if (resource === "categorias" && previous && previous.data.tipo !== data.tipo) {
    await ensureUnreferenced(client, id, "A categoria possui movimentações vinculadas.");
  }

  if (resource === "servicos" && previous && data.ministerioId && previous.data.ministerioId !== data.ministerioId) {
    const { rowCount } = await client.query(`
      SELECT 1 FROM icsv_records WHERE resource = 'escalas' AND deleted_at IS NULL
      AND data->>'servicoId' = $1 AND data->>'ministerioId' <> $2 LIMIT 1
    `, [id, data.ministerioId]);
    if (rowCount) throw new ApiError(409, "O serviço possui escalas vinculadas a outro ministério.");
  }

  if (resource === "escalas") {
    if (related.servicoId.data.ministerioId && related.servicoId.data.ministerioId !== data.ministerioId) {
      throw new ApiError(400, "Este serviço pertence a outro ministério.");
    }
    if (data.status === "pendente" || data.status === "confirmada") {
      await verifySchedule(client, id, data.pessoaId, related.eventoId.data);
    }
  }

  if (resource === "eventos" && previous && data.status !== "cancelado") {
    const changed = ["inicio", "fim", "status", "recorrencia", "recorrenciaAte"]
      .some((field) => data[field] !== previous.data[field]);
    if (!changed) return;

    const { rows } = await client.query<ResourceRow>(`
      SELECT * FROM icsv_records WHERE resource = 'escalas' AND deleted_at IS NULL
      AND data->>'eventoId' = $1 AND data->>'status' IN ('pendente', 'confirmada')
    `, [id]);
    for (const row of rows) await verifySchedule(client, row.id, row.data.pessoaId, data);
  }
}

async function save(
  client: PoolClient,
  actor: Actor,
  resource: ResourceName,
  id: string,
  data: RecordData,
  previous?: ResourceRow,
  action: "create" | "update" | "delete" = previous ? "update" : "create",
) {
  const { congregationId, links } = await prepareRecord(client, actor, resource, id, data, previous);
  const password = data.senha;
  delete data.senha;

  const updated = previous
    ? await client.query<ResourceRow>(`
      UPDATE icsv_records SET data = $2, congregation_id = $3, updated_at = now()
      WHERE id = $1 RETURNING *
    `, [id, JSON.stringify(data), congregationId])
    : await client.query<ResourceRow>(`
      INSERT INTO icsv_records (id, resource, congregation_id, data)
      VALUES ($1, $2, $3, $4) RETURNING *
    `, [id, resource, congregationId, JSON.stringify(data)]);

  await client.query("DELETE FROM icsv_record_links WHERE source_id = $1", [id]);
  for (const { field, target } of links) {
    await client.query(`
      INSERT INTO icsv_record_links (source_id, field, target_id, target_resource)
      VALUES ($1, $2, $3, $4)
    `, [id, field, target.id, target.resource]);
  }

  if (resource === "usuarios" && typeof password === "string") {
    await updatePassword(client, id, await hashPassword(password));
  }
  const identityChanged = resource === "usuarios" && previous &&
    (previous.data.email !== data.email || previous.data.perfilId !== data.perfilId ||
      previous.congregation_id !== congregationId);
  if (identityChanged || (previous?.data.ativo === true && data.ativo === false)) {
    await revokeAffectedSessions(client, resource, id);
  }

  const changedFields = Object.keys(data)
    .filter((field) => JSON.stringify(previous?.data[field]) !== JSON.stringify(data[field]));
  if (typeof password === "string") changedFields.push("senha");
  await writeHistory(client, actor, resource, id, action, changedFields);
  return item(updated.rows[0]);
}

async function revokeAffectedSessions(client: PoolClient, resource: ResourceName, id: string) {
  if (resource === "usuarios") {
    await client.query("DELETE FROM icsv_sessions WHERE user_id = $1", [id]);
    await client.query("DELETE FROM icsv_recovery WHERE user_id = $1", [id]);
  }
  if (resource === "perfis" || resource === "congregacoes") {
    const selector = resource === "perfis"
      ? "u.data->>'perfilId' = $1::text"
      : "u.congregation_id = $1::uuid AND EXISTS (SELECT 1 FROM icsv_records p WHERE p.id = (u.data->>'perfilId')::uuid AND p.data->>'escopo' = 'congregacao')";
    for (const table of ["icsv_sessions", "icsv_recovery"]) {
      await client.query(`
        DELETE FROM ${table} s USING icsv_records u
        WHERE s.user_id = u.id AND u.resource = 'usuarios' AND (${selector})
      `, [id]);
    }
  }
}

async function writeHistory(
  client: PoolClient,
  actor: Actor,
  resource: ResourceName,
  id: string,
  action: "create" | "update" | "delete",
  changedFields: string[],
) {
  await client.query(`
    INSERT INTO icsv_record_history (resource, record_id, actor_id, action, changed_fields)
    VALUES ($1, $2, $3, $4, $5)
  `, [resource, id, actor.id, action, changedFields]);
}

export async function createRecord(actor: Actor, resource: ResourceName, input: unknown) {
  assertWrite(actor, resource);
  const data = getResourceSchema(resource).parse(input);
  return mutate(resource, (client, current) => {
    if (resource === "congregacoes" && current.scope !== "campo") {
      throw new ApiError(403, "A criação de congregações exige escopo de campo.");
    }
    return save(client, current, resource, randomUUID(), data);
  });
}

export async function editRecord(actor: Actor, resource: ResourceName, id: string, input: unknown) {
  assertWrite(actor, resource);
  const patch = getResourceSchema(resource, "patch").parse(input);
  return mutate(resource, async (client, current) => {
    const previous = await findRecord(current, resource, id, client);
    if (resource === "usuarios" && current.id === previous.id && typeof patch.senha === "string") {
      throw new ApiError(400, "Altere sua senha em Minha conta.");
    }
    const merged = getResourceSchema(resource, "record").parse({ ...previous.data, ...patch });
    return save(client, current, resource, previous.id, merged, previous);
  });
}

export async function deleteRecord(actor: Actor, resource: ResourceName, id: string) {
  assertWrite(actor, resource);
  return mutate(resource, async (client, current) => {
    const old = await findRecord(current, resource, id, client);
    if (Object.hasOwn(old.data, "ativo")) {
      await save(client, current, resource, old.id, { ...old.data, ativo: false }, old, "delete");
    } else if (resource === "eventos") {
      await save(client, current, resource, old.id, { ...old.data, status: "cancelado" }, old, "delete");
    } else {
      await ensureUnreferenced(client, old.id, "O registro possui vínculos que impedem a exclusão.");
      await client.query("UPDATE icsv_records SET deleted_at = now(), updated_at = now() WHERE id = $1", [old.id]);
      await writeHistory(client, current, resource, old.id, "delete", []);
    }
  });
}

export async function getRecordHistory(actor: Actor, resource: ResourceName, id: string) {
  if (resource !== "pessoas" && resource !== "movimentacoes") {
    throw new ApiError(404, "Histórico indisponível para este cadastro.");
  }
  assertGrant(actor, `${resource}:read`);
  await findRecord(actor, resource, id, undefined, true);
  const { rows } = await database().query<{
    actor: string; action: string; at: Date; fields: string[];
  }>(`
    SELECT coalesce(u.data->>'nome', 'Conta administrativa') AS actor, h.action,
      h.changed_at AS at, h.changed_fields AS fields
    FROM icsv_record_history h LEFT JOIN icsv_records u ON u.id = h.actor_id
      AND ($3::boolean OR u.congregation_id = $4)
    WHERE h.resource = $1 AND h.record_id = $2 ORDER BY h.changed_at DESC, h.id DESC
  `, [resource, recordId(id), actor.scope === "campo", actor.congregacaoId]);
  return rows.map((row) => ({ ...row, at: row.at.toISOString() }));
}

export async function substituteSchedule(actor: Actor, id: string, personId: string) {
  assertWrite(actor, "escalas");
  return mutate("escalas", async (client, current) => {
    const old = await findRecord(current, "escalas", id, client);
    if (old.data.status === "substituida" || old.data.pessoaId === personId) {
      throw new ApiError(409, "Selecione outra escala ou outro voluntário para a substituição.");
    }
    await save(client, current, "escalas", old.id, { ...old.data, status: "substituida" }, old);
    const data = getResourceSchema("escalas").parse({
      ...old.data, pessoaId: personId, status: "pendente",
    });
    return save(client, current, "escalas", randomUUID(), data);
  });
}

const registrationStatus = z.enum(["inscrito", "confirmado", "presente", "ausente", "cancelado"]);
const attendanceChanges = z.strictObject({
  alteracoes: z.array(z.strictObject({
    id: z.uuid("Identificador de inscrição inválido.").toLowerCase(),
    statusAnterior: registrationStatus,
    status: z.enum(["presente", "ausente"]),
  })).min(1, "Envie pelo menos uma alteração de presença."),
});

function assertAttendanceRead(actor: Actor) {
  assertGrant(actor, "eventos:read");
  assertGrant(actor, "inscricoes:read");
  assertGrant(actor, "pessoas:read");
}

export async function getEventAttendance(actor: Actor, id: string) {
  assertAttendanceRead(actor);
  const { rows } = await database().query<{
    id: string;
    titulo: string;
    recorrencia: string;
    status: string;
    participantes: { id: string; pessoa: string; status: z.infer<typeof registrationStatus> }[];
  }>(`
    SELECT e.id, e.data->>'titulo' AS titulo, e.data->>'status' AS status,
      coalesce(e.data->>'recorrencia', 'nenhuma') AS recorrencia,
      coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'id', i.id, 'pessoa', p.data->>'nome', 'status', i.data->>'status'
        ) ORDER BY p.data->>'nome', i.id)
        FROM icsv_records i
        JOIN icsv_records p ON p.id = (i.data->>'pessoaId')::uuid
          AND p.resource = 'pessoas' AND p.deleted_at IS NULL
          AND p.congregation_id = e.congregation_id
        WHERE i.resource = 'inscricoes' AND i.deleted_at IS NULL
          AND i.congregation_id = e.congregation_id AND i.data->>'eventoId' = e.id::text
      ), '[]'::jsonb) AS participantes
    FROM icsv_records e WHERE e.id = $1 AND e.resource = 'eventos' AND e.deleted_at IS NULL
      AND ($2::boolean OR e.congregation_id = $3)
  `, [recordId(id), actor.scope === "campo", actor.congregacaoId]);
  if (!rows[0]) throw new ApiError(404, "Atividade não encontrada.");
  const { participantes, ...evento } = rows[0];
  return { evento, participantes };
}

export async function updateEventAttendance(actor: Actor, id: string, input: unknown) {
  assertAttendanceRead(actor);
  assertWrite(actor, "inscricoes");
  const { alteracoes } = attendanceChanges.parse(input);
  const ids = alteracoes.map((change) => change.id);
  if (new Set(ids).size !== ids.length) throw new ApiError(400, "Cada inscrição só pode aparecer uma vez.");

  await mutate("inscricoes", async (client, current) => {
    assertAttendanceRead(current);
    const event = await findRecord(current, "eventos", id, client);
    if (event.data.status === "cancelado") {
      throw new ApiError(409, "Uma atividade cancelada não aceita alterações na chamada.");
    }

    const { rows } = await client.query<{ id: string; status: string }>(`
      SELECT id, data->>'status' AS status FROM icsv_records
      WHERE resource = 'inscricoes' AND deleted_at IS NULL AND id = ANY($1::uuid[])
        AND congregation_id = $2 AND data->>'eventoId' = $3
    `, [ids, event.congregation_id, event.id]);
    if (rows.length !== ids.length) {
      throw new ApiError(404, "Uma ou mais inscrições não foram encontradas nesta atividade.");
    }

    const statuses = new Map(rows.map((row) => [row.id, row.status]));
    for (const change of alteracoes) {
      const status = statuses.get(change.id);
      if (status === "cancelado") throw new ApiError(409, "Uma inscrição cancelada não pode receber presença.");
      if (status !== change.statusAnterior) {
        throw new ApiError(409, "A chamada foi alterada. Recarregue a lista antes de tentar novamente.");
      }
    }

    const updates = alteracoes.filter((change) => change.status !== change.statusAnterior);
    if (!updates.length) return;
    await client.query(`
      WITH updated AS (
        UPDATE icsv_records r
        SET data = jsonb_set(r.data, '{status}', to_jsonb(a.status)), updated_at = now()
        FROM unnest($1::uuid[], $2::text[]) AS a(id, status)
        WHERE r.id = a.id RETURNING r.id
      )
      INSERT INTO icsv_record_history (resource, record_id, actor_id, action, changed_fields)
      SELECT 'inscricoes', id, $3, 'update', ARRAY['status'] FROM updated
    `, [updates.map((change) => change.id), updates.map((change) => change.status), current.id]);
  });
}
