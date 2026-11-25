import { requireUser } from "@/lib/server/auth";
import { api } from "@/lib/server/http";
import { getKidsAdministration } from "@/lib/server/kids";

export async function GET() {
  return api(async () => Response.json(await getKidsAdministration(await requireUser())));
}
