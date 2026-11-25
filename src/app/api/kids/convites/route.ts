import { api, guardOrigin, json } from "@/lib/server/http";
import { createKidsInvitation } from "@/lib/server/kids";

export async function POST(request: Request) {
  return api(async () => {
    guardOrigin(request);
    return Response.json(await createKidsInvitation(await json(request)), { status: 201 });
  });
}
