import { z } from "zod";
import { changeOwnPassword } from "@/lib/server/auth";
import { api, guardOrigin, json } from "@/lib/server/http";

const schema = z.strictObject({
  currentPassword: z.string().min(1, "Informe sua senha atual.").max(128),
  newPassword: z.string().min(8, "Use uma senha com pelo menos 8 caracteres.").max(128),
});

export function POST(request: Request) {
  return api(async () => {
    guardOrigin(request);
    const { currentPassword, newPassword } = schema.parse(await json(request));
    await changeOwnPassword(currentPassword, newPassword);
    return new Response(null, { status: 204 });
  });
}
