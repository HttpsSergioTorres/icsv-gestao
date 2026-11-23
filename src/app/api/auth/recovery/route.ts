import { z } from "zod";
import { NextResponse } from "next/server";
import { issueRecovery } from "@/lib/server/auth";
import { api, guardOrigin, json } from "@/lib/server/http";

const schema = z.object({ email: z.email("Informe um e-mail válido.").max(254).toLowerCase() });

export async function POST(request: Request) {
  return api(async () => {
    guardOrigin(request);
    const { email } = schema.parse(await json(request));
    return NextResponse.json(await issueRecovery(email), { status: 201 });
  });
}
