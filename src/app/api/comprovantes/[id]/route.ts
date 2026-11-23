import { requireUser } from "@/lib/server/auth";
import { api } from "@/lib/server/http";
import { getReceipt } from "@/lib/server/receipts";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return api(async () => {
    const user = await requireUser();
    const { id } = await params;
    return getReceipt(user, id);
  });
}
