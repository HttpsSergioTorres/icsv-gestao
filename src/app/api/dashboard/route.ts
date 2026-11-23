import { NextResponse } from "next/server";
import { api } from "@/lib/server/http";
import { readOverview } from "@/lib/server/overview";

export const runtime = "nodejs";

export function GET(request: Request) {
  return api(async () => NextResponse.json(await readOverview(request, "dashboard")));
}
