import { readFile } from "node:fs/promises";
import { readConfig, replayFromPayload, runScenario } from "./workflow.js";

const modeArg = process.argv[2];

if (modeArg !== "broken" && modeArg !== "fixed" && modeArg !== "replay") {
  console.error("Usage: node --import tsx src/index.ts <broken|fixed|replay> [payload.json]");
  process.exit(1);
}

const config = readConfig();

const run =
  modeArg === "replay"
    ? readFile(process.argv[3] ?? "", "utf8")
        .then((content) => replayFromPayload(JSON.parse(content) as Record<string, unknown>, config))
        .catch((error) => {
          throw new Error(
            `Could not load replay payload. Usage: pnpm replay ./payload.json. ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        })
    : runScenario(modeArg, config);

run
  .then((result) => {
    console.log("");
    console.log("Debug handoff app");
    console.log(`Mode: ${modeArg}`);
    console.log(`Run ID: ${result.runId}`);
    console.log(`Project ID: ${config.projectId}`);
    console.log(`Endpoint: ${config.endpoint}`);
    console.log(`Status: ${result.status}`);

    if ("headline" in result) {
      console.log(`Headline: ${result.headline}`);
    }

    if ("error" in result) {
      console.log(`Failure: ${result.error}`);
    }

    console.log(
      modeArg === "broken"
        ? "Expected trace shape: direct researcher -> writer handoff, then output validation failure."
        : modeArg === "fixed"
          ? "Expected trace shape: researcher -> verifier -> writer, then successful output validation."
          : "Expected trace shape: replayed researcher -> writer message, then writer validation pass/fail.",
    );
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
