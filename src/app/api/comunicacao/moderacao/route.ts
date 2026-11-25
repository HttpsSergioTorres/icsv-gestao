import { requireUser } from "@/lib/server/auth";
import { readModeration } from "@/lib/server/communications";
import { api } from "@/lib/server/http";

export function GET() {
  return api(async () => Response.json({ pedidos: await readModeration(await requireUser()) }));
}
