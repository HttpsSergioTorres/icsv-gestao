import { logout } from "@/lib/server/auth";
import { api, guardOrigin } from "@/lib/server/http";

export async function POST(request: Request) {
  return api(async () => {
    guardOrigin(request);
    await logout();
    return new Response(null, { status: 204 });
  });
}
