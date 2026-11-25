import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import { headquarters } from "./access-admin";
import { assertGrant, requireUser, type Actor } from "./auth";
import { database, recordTransaction } from "./db";
import { ApiError } from "./http";

type Audience = "geral" | "kids";
type Status = "pendente" | "aprovado" | "rejeitado";
type Notice = { id: string; titulo: string; texto: string; publico: Audience | "todos"; criadoEm: Date };
type Prayer = { id: string; texto: string; anonimo: boolean; criadoEm: Date };
type PublicPrayer = Prayer & { autor: string | null };
type OwnPrayer = Prayer & { status: Status };
type ModerationPrayer = PublicPrayer & OwnPrayer & { publico: Audience };

const noticeInput = z.strictObject({
  titulo: z.string().trim().min(1, "Informe o título do aviso.").max(120),
  texto: z.string().trim().min(1, "Informe o texto do aviso.").max(1500),
  publico: z.enum(["todos", "geral", "kids"], "Escolha o público do aviso."),
});
const prayerInput = z.strictObject({
  texto: z.string().trim().min(1, "Escreva o pedido de oração.").max(1200),
  anonimo: z.boolean(),
});
const moderationInput = z.strictObject({
  status: z.enum(["aprovado", "rejeitado"], "Selecione uma decisão de moderação."),
});

function permissions(actor: Actor) {
  const kids = actor.grants.has("kids:play");
  return {
    publish: !kids && actor.grants.has("communications:post"),
    moderate: !kids && actor.grants.has("communications:moderate"),
  };
}

async function communicationContext(actor: Actor, client?: PoolClient) {
  assertGrant(actor, "communications:use");
  const congregationId = actor.congregacaoId ?? (actor.scope === "campo" ? (await headquarters(client)).id : null);
  if (!congregationId) throw new ApiError(403, "Selecione um perfil de uma congregação ativa.");
  const audience: Audience = actor.grants.has("kids:play") ? "kids" : "geral";
  return { congregationId, audience, permissions: permissions(actor) };
}

export async function readCommunications(actor: Actor) {
  const context = await communicationContext(actor);
  const db = database();
  const [notices, prayers, personal] = await Promise.all([
    db.query<Notice>(`
      SELECT id, title AS titulo, body AS texto, audience AS publico, created_at AS "criadoEm"
      FROM icsv_notices WHERE congregation_id = $1 AND audience IN ('todos', $2)
      ORDER BY created_at DESC, id
    `, [context.congregationId, context.audience]),
    db.query<PublicPrayer>(`
      SELECT p.id, p.body AS texto, p.anonymous AS anonimo, p.created_at AS "criadoEm",
        CASE WHEN p.anonymous THEN NULL ELSE u.data->>'nome' END AS autor
      FROM icsv_prayer_requests p
      JOIN icsv_records u ON u.id = p.author_id
      WHERE p.congregation_id = $1 AND p.audience = $2 AND p.status = 'aprovado'
      ORDER BY p.moderated_at DESC, p.id
    `, [context.congregationId, context.audience]),
    db.query<OwnPrayer>(`
      SELECT id, body AS texto, anonymous AS anonimo, status, created_at AS "criadoEm"
      FROM icsv_prayer_requests
      WHERE congregation_id = $1 AND author_id = $2 AND audience = $3
      ORDER BY created_at DESC, id
    `, [context.congregationId, actor.id, context.audience]),
  ]);
  return { avisos: notices.rows, pedidos: prayers.rows, meusPedidos: personal.rows, permissions: context.permissions };
}

export async function createNotice(input: unknown) {
  return recordTransaction(async (client) => {
    const actor = await requireUser(client);
    const context = await communicationContext(actor, client);
    if (!context.permissions.publish) throw new ApiError(403, "Seu perfil não pode publicar avisos.");
    const notice = noticeInput.parse(input);
    const { rows: [item] } = await client.query<Notice>(`
      INSERT INTO icsv_notices (id, congregation_id, created_by, title, body, audience)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, title AS titulo, body AS texto, audience AS publico, created_at AS "criadoEm"
    `, [randomUUID(), context.congregationId, actor.id, notice.titulo, notice.texto, notice.publico]);
    return item;
  });
}

export async function createPrayer(input: unknown) {
  return recordTransaction(async (client) => {
    const actor = await requireUser(client);
    const context = await communicationContext(actor, client);
    const prayer = prayerInput.parse(input);
    const { rows: [item] } = await client.query<OwnPrayer>(`
      INSERT INTO icsv_prayer_requests (id, congregation_id, author_id, body, anonymous, audience)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, body AS texto, anonymous AS anonimo, status, created_at AS "criadoEm"
    `, [randomUUID(), context.congregationId, actor.id, prayer.texto, prayer.anonimo, context.audience]);
    return item;
  });
}

export async function readModeration(actor: Actor) {
  const context = await communicationContext(actor);
  if (!context.permissions.moderate) throw new ApiError(403, "Seu perfil não pode moderar pedidos.");
  const { rows } = await database().query<ModerationPrayer>(`
    SELECT p.id, p.body AS texto, p.anonymous AS anonimo, p.created_at AS "criadoEm",
      p.status, p.audience AS publico, u.data->>'nome' AS autor
    FROM icsv_prayer_requests p
    JOIN icsv_records u ON u.id = p.author_id
    WHERE p.congregation_id = $1
    ORDER BY (p.status = 'pendente') DESC, p.created_at DESC, p.id
  `, [context.congregationId]);
  return rows;
}

export async function moderatePrayer(id: string, input: unknown) {
  return recordTransaction(async (client) => {
    const actor = await requireUser(client);
    const context = await communicationContext(actor, client);
    if (!context.permissions.moderate) throw new ApiError(403, "Seu perfil não pode moderar pedidos.");
    const { status } = moderationInput.parse(input);
    const prayerId = z.uuid().safeParse(id);
    if (!prayerId.success) throw new ApiError(404, "Pedido não encontrado.");

    const updated = await client.query(`
      UPDATE icsv_prayer_requests
      SET status = $3, moderated_by = $4, moderated_at = now()
      WHERE congregation_id = $1 AND id = $2 AND status = 'pendente'
    `, [context.congregationId, prayerId.data, status, actor.id]);
    if (updated.rowCount) return;

    const current = await client.query(`
      SELECT 1 FROM icsv_prayer_requests WHERE congregation_id = $1 AND id = $2
    `, [context.congregationId, prayerId.data]);
    if (!current.rowCount) throw new ApiError(404, "Pedido não encontrado.");
    throw new ApiError(409, "O pedido já foi moderado. Atualize a lista.");
  });
}
