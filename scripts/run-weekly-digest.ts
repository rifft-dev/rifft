/**
 * Weekly digest cron runner
 *
 * Calls the batch digest endpoint on the Rifft API so every Scale project
 * with "Weekly digest" enabled receives their Monday summary email.
 *
 * Usage
 * ─────
 * Direct:
 *   tsx scripts/run-weekly-digest.ts
 *
 * Via npm/pnpm (add to root package.json scripts):
 *   "digest": "tsx scripts/run-weekly-digest.ts"
 *
 * Vercel Cron (vercel.json):
 *   {
 *     "crons": [{ "path": "/api/cron/weekly-digest", "schedule": "0 9 * * 1" }]
 *   }
 *   — or point the cron at a tiny Next.js route that calls this same endpoint.
 *
 * Linux cron (every Monday at 09:00 UTC):
 *   0 9 * * 1 cd /app && pnpm digest >> /var/log/rifft-digest.log 2>&1
 *
 * Environment variables required
 * ────────────────────────────────
 *   API_BASE_URL        Internal base URL of apps/api  (e.g. http://localhost:4000)
 *   INTERNAL_API_SECRET Secret set in apps/api env (optional but strongly recommended)
 */

const apiBaseUrl = process.env.API_BASE_URL ?? "http://localhost:4000";
const internalSecret = process.env.INTERNAL_API_SECRET ?? "";

async function runWeeklyDigest(): Promise<void> {
  const url = `${apiBaseUrl}/internal/weekly-digest`;
  console.log(`[weekly-digest] POST ${url}`);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (internalSecret) {
    headers["x-internal-secret"] = internalSecret;
  }

  const response = await fetch(url, { method: "POST", headers });

  if (!response.ok) {
    const body = await response.text().catch(() => "(no body)");
    console.error(`[weekly-digest] Request failed: ${response.status} ${body}`);
    process.exit(1);
  }

  const data = (await response.json()) as {
    ok: boolean;
    sent: number;
    skipped: number;
    projects: Array<{ project_id: string; skipped: boolean; reason?: string; regressions?: number; traces?: number }>;
  };

  console.log(
    `[weekly-digest] Done — sent: ${data.sent}, skipped: ${data.skipped}`,
  );

  for (const p of data.projects) {
    if (p.skipped) {
      console.log(`  skip  ${p.project_id}  (${p.reason ?? "unknown"})`);
    } else {
      console.log(
        `  sent  ${p.project_id}  regressions=${p.regressions ?? 0}  traces=${p.traces ?? 0}`,
      );
    }
  }
}

runWeeklyDigest().catch((err: unknown) => {
  console.error("[weekly-digest] Unexpected error:", err);
  process.exit(1);
});
