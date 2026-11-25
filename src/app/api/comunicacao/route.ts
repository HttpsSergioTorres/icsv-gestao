import { requireUser } from "@/lib/server/auth";
import { readCommunications } from "@/lib/server/communications";
import { api } from "@/lib/server/http";

export function GET() {
  return api(async () => Response.json(await readCommunications(await requireUser())));
}
