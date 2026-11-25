import { requireUser } from "@/lib/server/auth";
import { api, guardOrigin, json } from "@/lib/server/http";
import { getMyKidsLinks, requestKidsLink } from "@/lib/server/kids";

export async function GET() {
  return api(async () => Response.json(await getMyKidsLinks(await requireUser())));
}

export async function POST(request: Request) {
  return api(async () => {
    guardOrigin(request);
    await requestKidsLink(await json(request));
    return new Response(null, { status: 201 });
  });
}
