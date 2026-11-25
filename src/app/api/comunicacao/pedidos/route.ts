import { createPrayer } from "@/lib/server/communications";
import { api, guardOrigin, json } from "@/lib/server/http";

export function POST(request: Request) {
  return api(async () => {
    guardOrigin(request);
    const item = await createPrayer(await json(request));
    return Response.json({ item }, { status: 201 });
  });
}
