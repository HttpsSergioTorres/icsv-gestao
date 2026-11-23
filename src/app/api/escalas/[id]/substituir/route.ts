import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/server/auth";
import { api, guardOrigin, json } from "@/lib/server/http";
import { substituteSchedule } from "@/lib/server/records";

const schema = z.object({ pessoaId: z.uuid("Selecione um voluntário válido.").toLowerCase() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    guardOrigin(request);
    const user = await requireUser();
    const { id } = await params;
    const { pessoaId } = schema.parse(await json(request));
    const item = await substituteSchedule(user, id, pessoaId);
    return NextResponse.json({ item }, { status: 201 });
  });
}
