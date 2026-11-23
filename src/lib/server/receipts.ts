import { randomUUID } from "node:crypto";
import { assertGrant, requireUser, type Actor } from "./auth";
import { database, recordTransaction } from "./db";
import { ApiError, readBody } from "./http";
import { recordId } from "./records";

const maxSize = 5 * 1024 * 1024;
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function detectType(contents: Buffer) {
  if (contents.subarray(0, 5).equals(Buffer.from("%PDF-"))) return "application/pdf";
  if (contents.subarray(0, 8).equals(png)) return "image/png";
  if (contents[0] === 0xff && contents[1] === 0xd8 && contents[2] === 0xff) return "image/jpeg";
  throw new ApiError(400, "O comprovante precisa ser PDF, PNG ou JPEG.");
}

export async function uploadReceipt(actor: Actor, request: Request) {
  assertGrant(actor, "movimentacoes:write");
  const body = await readBody(request, maxSize + 16 * 1024);
  let form: FormData;
  try {
    form = await new Response(body, {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
  } catch {
    throw new ApiError(400, "Envie o comprovante em formato de formulário.");
  }
  const congregation = form.get("congregacaoId");
  const file = form.get("file");
  if (typeof congregation !== "string" || !file || typeof file === "string") {
    throw new ApiError(400, "Selecione uma congregação e um comprovante.");
  }
  if (file.size > maxSize) throw new ApiError(413, "O comprovante deve ter no máximo 5 MB.");
  const congregationId = recordId(congregation);
  if (actor.scope === "congregacao" && actor.congregacaoId !== congregationId) {
    throw new ApiError(404, "Congregação não encontrada.");
  }
  const contents = Buffer.from(await file.arrayBuffer());
  const mime = detectType(contents);
  const name = file.name.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 128) || "comprovante";
  const id = randomUUID();
  await recordTransaction(async (client) => {
    const current = await requireUser(client);
    assertGrant(current, "movimentacoes:write");
    if (current.scope === "congregacao" && current.congregacaoId !== congregationId) {
      throw new ApiError(404, "Congregação não encontrada.");
    }
    const { rowCount } = await client.query(`
      INSERT INTO icsv_receipts (id, congregation_id, name, mime, contents)
      SELECT $1, id, $3, $4, $5 FROM icsv_records
      WHERE id = $2 AND resource = 'congregacoes' AND deleted_at IS NULL AND data->>'ativo' = 'true'
    `, [id, congregationId, name, mime, contents]);
    if (!rowCount) throw new ApiError(404, "Congregação ativa não encontrada.");
  });
  return { url: `/api/comprovantes/${id}` };
}

export async function getReceipt(actor: Actor, id: string) {
  assertGrant(actor, "movimentacoes:read");
  const { rows } = await database().query<{ mime: string; name: string; contents: Buffer }>(`
    SELECT mime, name, contents FROM icsv_receipts
    WHERE id = $1 AND ($2::boolean OR congregation_id = $3)
  `, [recordId(id), actor.scope === "campo", actor.congregacaoId]);
  const receipt = rows[0];
  if (!receipt) throw new ApiError(404, "Comprovante não encontrado.");
  const name = encodeURIComponent(receipt.name.toWellFormed())
    .replace(/['()*]/g, (value) => `%${value.charCodeAt(0).toString(16)}`);
  return new Response(new Uint8Array(receipt.contents), {
    headers: {
      "Content-Type": receipt.mime,
      "Content-Disposition": `attachment; filename*=UTF-8''${name}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
