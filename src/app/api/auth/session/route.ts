import { NextResponse } from "next/server";
import { getUser, publicUser } from "@/lib/server/auth";
import { api } from "@/lib/server/http";

export async function GET() {
  return api(async () => {
    const user = await getUser();
    return NextResponse.json({ user: user ? publicUser(user) : null });
  });
}
