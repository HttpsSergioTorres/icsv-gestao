import { NextResponse } from "next/server";
import { requireUser } from "@/lib/server/auth";
import { api, guardOrigin } from "@/lib/server/http";
import { uploadReceipt } from "@/lib/server/receipts";

export async function POST(request: Request) {
  return api(async () => {
    guardOrigin(request);
    const user = await requireUser();
    return NextResponse.json(await uploadReceipt(user, request), { status: 201 });
  });
}
