import { moderatePrayer } from "@/lib/server/communications";
import { api, guardOrigin, json } from "@/lib/server/http";

type Context = { params: Promise<{ id: string }> };

export function PATCH(request: Request, { params }: Context) {
  return api(async () => {
    guardOrigin(request);
    await moderatePrayer((await params).id, await json(request));
    return new Response(null, { status: 204 });
  });
}
