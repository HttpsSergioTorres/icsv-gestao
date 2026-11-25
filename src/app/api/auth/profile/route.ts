import { z } from "zod";
import { listSessionProfiles, publicUser, selectSessionProfile } from "@/lib/server/auth";
import { api, guardOrigin, json } from "@/lib/server/http";

export function GET() {
  return api(async () => Response.json({ profiles: await listSessionProfiles() }));
}

export function POST(request: Request) {
  return api(async () => {
    guardOrigin(request);
    const { assignmentId } = z.strictObject({ assignmentId: z.uuid() }).parse(await json(request));
    return Response.json({ user: publicUser(await selectSessionProfile(assignmentId)) });
  });
}
