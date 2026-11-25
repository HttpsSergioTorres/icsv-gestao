import { api, guardOrigin, json } from "@/lib/server/http";
import { reviewKidsLink, withdrawKidsLink } from "@/lib/server/kids";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Context) {
  return api(async () => {
    guardOrigin(request);
    await reviewKidsLink((await params).id, await json(request));
    return new Response(null, { status: 204 });
  });
}

export async function DELETE(request: Request, { params }: Context) {
  return api(async () => {
    guardOrigin(request);
    await withdrawKidsLink((await params).id);
    return new Response(null, { status: 204 });
  });
}
