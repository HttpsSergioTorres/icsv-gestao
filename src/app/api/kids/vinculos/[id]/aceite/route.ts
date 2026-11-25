import { api, guardOrigin, json } from "@/lib/server/http";
import { acceptKidsTerm } from "@/lib/server/kids";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    guardOrigin(request);
    await acceptKidsTerm((await params).id, await json(request));
    return new Response(null, { status: 204 });
  });
}
