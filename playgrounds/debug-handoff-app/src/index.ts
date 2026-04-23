import { readConfig, runScenario } from "./workflow.js";

const modeArg = process.argv[2];

if (modeArg !== "broken" && modeArg !== "fixed") {
  console.error("Usage: node --import tsx src/index.ts <broken|fixed>");
  process.exit(1);
}

const config = readConfig();

runScenario(modeArg, config)
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
        : "Expected trace shape: researcher -> verifier -> writer, then successful output validation.",
    );
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
