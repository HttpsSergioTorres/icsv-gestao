import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { api, guardOrigin, json } from "@/lib/server/http";
import { getEventAttendance, updateEventAttendance } from "@/lib/server/records";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  return api(async () => {
    const user = await requireUser();
    const { id } = await params;
    return NextResponse.json(await getEventAttendance(user, id));
  });
}

export async function PATCH(request: Request, { params }: Context) {
  return api(async () => {
    guardOrigin(request);
    const user = await requireUser();
    const { id } = await params;
    await updateEventAttendance(user, id, await json(request));
    return new Response(null, { status: 204 });
  });
}
