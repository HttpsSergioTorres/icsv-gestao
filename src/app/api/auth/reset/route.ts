import { z } from "zod";
import { resetPassword } from "@/lib/server/auth";
import { api, guardOrigin, json } from "@/lib/server/http";

const schema = z.object({
  token: z.string().trim().regex(/^[A-Za-z0-9_-]{32}$/, "Código inválido ou expirado."),
  password: z.string().min(8, "Use uma senha com pelo menos 8 caracteres.").max(128),
});

export async function POST(request: Request) {
  return api(async () => {
    guardOrigin(request);
    const { token, password } = schema.parse(await json(request));
    await resetPassword(token, password);
    return new Response(null, { status: 204 });
  });
}
