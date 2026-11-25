import { NextResponse } from "next/server";
import { financeSection } from "@/lib/domain/finance";
import { allocateMovement, createFinanceAccount, readFinance } from "@/lib/server/finance";
import { api, ApiError, guardOrigin, json } from "@/lib/server/http";

type Context = { params: Promise<{ secao: string }> };

export async function GET(request: Request, { params }: Context) {
  return api(async () => {
    const section = financeSection((await params).secao);
    if (!section) throw new ApiError(404, "Seção financeira não encontrada.");
    return NextResponse.json(await readFinance(request, section.slug));
  });
}

export async function POST(request: Request, { params }: Context) {
  return api(async () => {
    guardOrigin(request);
    const { secao } = await params;
    return NextResponse.json(await createFinanceAccount(secao, await json(request)), { status: 201 });
  });
}

export async function PATCH(request: Request, { params }: Context) {
  return api(async () => {
    guardOrigin(request);
    const { secao } = await params;
    await allocateMovement(secao, await json(request));
    return new Response(null, { status: 204 });
  });
}
