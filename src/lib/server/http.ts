import { NextResponse } from "next/server";
import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export async function readBody(request: Request, byteLimit: number) {
  const message = "O corpo da requisição ultrapassa o limite permitido.";
  if (Number(request.headers.get("content-length")) > byteLimit) throw new ApiError(413, message);
  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > byteLimit) {
        await reader.cancel().catch(() => {});
        throw new ApiError(413, message);
      }
      chunks.push(value);
    }
    return new Uint8Array(Buffer.concat(chunks, size));
  } finally {
    reader.releaseLock();
  }
}

export async function json(request: Request): Promise<unknown> {
  const body = await readBody(request, 64 * 1024);
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new ApiError(400, "Envie um JSON válido.");
  }
}

export function guardOrigin(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiError(403, "A origem da requisição não é permitida.");
  }
  const origin = request.headers.get("origin");
  if (!origin) return;
  const requestUrl = new URL(request.url);
  const host = request.headers.get("host");
  const sameHost = host && [`http://${host}`, `https://${host}`].includes(origin);
  if (origin !== requestUrl.origin && !sameHost) {
    throw new ApiError(403, "A origem da requisição não é permitida.");
  }
}

export async function api(work: () => Promise<Response>) {
  try {
    const response = await work();
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    let status = 500;
    let message = "Não foi possível concluir a operação.";
    if (error instanceof ApiError) {
      status = error.status;
      message = error.message;
    } else if (error instanceof ZodError) {
      status = 400;
      const issue = error.issues[0];
      message = issue ? issue.message : "Os dados enviados são inválidos.";
    } else if (error instanceof Error && "code" in error && error.code === "23505") {
      status = 409;
      message = "Já existe um registro com esses dados.";
    } else if (error instanceof Error && "code" in error && error.code === "23503") {
      status = 409;
      message = "A operação não é permitida devido a vínculos com outros registros.";
    } else {
      const errorName = error instanceof Error ? error.name : "UnknownError";
      const code = error instanceof Error && "code" in error ? error.code : undefined;
      console.error("Erro na API ICSV", errorName, code);
    }
    return NextResponse.json({ error: message }, {
      status,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
