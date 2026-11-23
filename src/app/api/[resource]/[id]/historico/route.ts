import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { api } from "@/lib/server/http";
import { getRecordHistory, resourceName } from "@/lib/server/records";

type Context = { params: Promise<{ resource: string; id: string }> };

export async function GET(_request: Request, { params }: Context) {
  return api(async () => {
    const user = await requireUser();
    const { resource, id } = await params;
    return NextResponse.json({ items: await getRecordHistory(user, resourceName(resource), id) });
  });
}
