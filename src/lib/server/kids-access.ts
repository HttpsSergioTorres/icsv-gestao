import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { database } from "./db";

import { demoKidsTerm } from "@/lib/domain/kids-demo-term";

function localDatabase() {
  try {
    const url = new URL(process.env.DATABASE_URL ?? "");
    return ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      && !url.searchParams.has("host") && !url.searchParams.has("hostaddr");
  } catch {
    return false;
  }
}

export function kidsTerm() {
  const version = process.env.ICSV_KIDS_TERMO_VERSAO?.trim();
  const text = process.env.ICSV_KIDS_TERMO_TEXTO?.trim();
  const configured = version && text && version.length <= 96 && !version.startsWith("demo-")
    ? { version, text, demo: false }
    : null;
  const term = version || text ? configured
    : process.env.ICSV_KIDS_DEMO === "true" && localDatabase() ? demoKidsTerm : null;
  if (!term) return null;
  return { ...term, hash: createHash("sha256").update(term.text).digest("hex") };
}

export const eligibleChild = `
  p.resource = 'pessoas' AND p.deleted_at IS NULL AND p.data->>'ativo' = 'true'
  AND p.data->>'nascimento' > to_char(current_date - interval '18 years', 'YYYY-MM-DD')
  AND p.data->>'nascimento' <= to_char(current_date, 'YYYY-MM-DD')
`;

export async function hasKidsAccess(userId: string, congregationId: string | null, client?: PoolClient) {
  const term = kidsTerm();
  if (!term || !congregationId) return false;
  const { rowCount } = await (client ?? database()).query(
    `SELECT 1 FROM icsv_kids_links l
     JOIN icsv_records p ON p.id = l.child_id AND p.congregation_id = l.congregation_id
     JOIN icsv_kids_acceptances a ON a.link_id = l.id AND a.guardian_id = l.guardian_id
     WHERE l.guardian_id = $1 AND l.congregation_id = $2 AND l.status = 'confirmado'
       AND a.term_version = $3 AND a.term_hash = $4 AND a.demo = $5 AND (${eligibleChild})
     LIMIT 1`, [userId, congregationId, term.version, term.hash, term.demo],
  );
  return rowCount === 1;
}
