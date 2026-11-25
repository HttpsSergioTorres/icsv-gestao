import { z } from "zod";
import { NextResponse } from "next/server";
import { login } from "@/lib/server/auth";
import { api, guardOrigin, json } from "@/lib/server/http";

const schema = z.object({
  email: z.email("Informe um e-mail válido.").max(254).toLowerCase(),
  password: z.string().min(1, "Informe a senha.").max(128),
});

export async function POST(request: Request) {
  return api(async () => {
    guardOrigin(request);
    const { email, password } = schema.parse(await json(request));
    await login(email, password);
    return NextResponse.json({ selectProfile: true });
  });
}
