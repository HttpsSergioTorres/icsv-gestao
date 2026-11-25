import { NextResponse } from "next/server";
import { assertGrant, requireUser } from "@/lib/server/auth";
import { api, guardOrigin, json } from "@/lib/server/http";
import { createTraining, listTraining } from "@/lib/server/training";

export async function GET(request: Request) {
  return api(async () => {
    const actor = await requireUser();
    const ministry = new URL(request.url).searchParams.get("ministerioId") ?? undefined;
    return NextResponse.json(await listTraining(actor, ministry));
  });
}

export async function POST(request: Request) {
  return api(async () => {
    guardOrigin(request);
    assertGrant(await requireUser(), "training:manage");
    return NextResponse.json(await createTraining(await json(request)), { status: 201 });
  });
}
