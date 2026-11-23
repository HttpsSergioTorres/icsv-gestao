import { NextResponse } from "next/server";
import { assertGrant, requireUser } from "@/lib/server/auth";
import { api, guardOrigin, json } from "@/lib/server/http";
import { createRecord, listRecords, resourceName } from "@/lib/server/records";

type Context = { params: Promise<{ resource: string }> };

export async function GET(request: Request, { params }: Context) {
  return api(async () => {
    const user = await requireUser();
    const resource = resourceName((await params).resource);
    assertGrant(user, `${resource}:read`);
    const congregationId = new URL(request.url).searchParams.get("congregacaoId") ?? undefined;
    return NextResponse.json({ items: await listRecords(user, resource, congregationId) });
  });
}

export async function POST(request: Request, { params }: Context) {
  return api(async () => {
    guardOrigin(request);
    const user = await requireUser();
    const resource = resourceName((await params).resource);
    return NextResponse.json({ item: await createRecord(user, resource, await json(request)) }, { status: 201 });
  });
}
