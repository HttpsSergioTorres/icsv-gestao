import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { api, guardOrigin, json } from "@/lib/server/http";
import { deleteRecord, editRecord, getRecord, resourceName } from "@/lib/server/records";

type Context = { params: Promise<{ resource: string; id: string }> };

export async function GET(_request: Request, { params }: Context) {
  return api(async () => {
    const user = await requireUser();
    const { resource, id } = await params;
    return NextResponse.json({ item: await getRecord(user, resourceName(resource), id) });
  });
}

export async function PATCH(request: Request, { params }: Context) {
  return api(async () => {
    guardOrigin(request);
    const user = await requireUser();
    const { resource, id } = await params;
    const item = await editRecord(user, resourceName(resource), id, await json(request));
    return NextResponse.json({ item });
  });
}

export async function DELETE(request: Request, { params }: Context) {
  return api(async () => {
    guardOrigin(request);
    const user = await requireUser();
    const { resource, id } = await params;
    await deleteRecord(user, resourceName(resource), id);
    return new Response(null, { status: 204 });
  });
}
