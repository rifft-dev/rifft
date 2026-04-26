"use client";

import { useEffect } from "react";

/**
 * Silently repairs a stale active-project cookie when the server has fallen
 * back to a different project (e.g. the preferred project was deleted).
 *
 * Rendered server-side only when `resolution.repaired === true`. Fires a
 * single POST to /api/cloud/active-project so the corrected project ID gets
 * persisted to the cookie — without this, every page load re-resolves the
 * same mismatch and the cookie is never updated.
 */
export function ProjectCookieRepair({ projectId }: { projectId: string }) {
  useEffect(() => {
    void fetch("/api/cloud/active-project", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
  }, [projectId]);

  return null;
}
