export const siteName = "Rifft";
export const siteUrl =
  process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "https://app.rifft.dev";
export const ogImageUrl = `${siteUrl}/og.png`;
export const siteDescription =
  "Debug your AI agent pipelines faster. Rifft traces the handoff that broke your run, classifies failures with the MAST taxonomy, and lets you fork and replay without restarting your agents.";
