import { NextResponse } from "next/server";
import { assertGrant, requireUser } from "@/lib/server/auth";
import { api, guardOrigin, json } from "@/lib/server/http";
import { editTraining, performTrainingAction, readTraining } from "@/lib/server/training";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  return api(async () => {
    const actor = await requireUser();
    return NextResponse.json(await readTraining(actor, (await params).id));
  });
}

export async function PATCH(request: Request, { params }: Context) {
  return api(async () => {
    guardOrigin(request);
    assertGrant(await requireUser(), "training:manage");
    await editTraining((await params).id, await json(request));
    return new Response(null, { status: 204 });
  });
}

export async function POST(request: Request, { params }: Context) {
  return api(async () => {
    guardOrigin(request);
    assertGrant(await requireUser(), "training:learn");
    return NextResponse.json({ progresso: await performTrainingAction((await params).id, await json(request)) });
  });
}
