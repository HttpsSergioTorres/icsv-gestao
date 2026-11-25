import { api, guardOrigin, json } from "@/lib/server/http";
import { registerGuardian } from "@/lib/server/kids";

export async function POST(request: Request) {
  return api(async () => {
    guardOrigin(request);
    await registerGuardian(await json(request));
    return new Response(null, { status: 201 });
  });
}
