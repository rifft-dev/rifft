import { runScenario } from "./scenario";

runScenario("fixed")
  .then((result) => {
    console.log("");
    console.log("Debug handoff playground");
    console.log("Mode: fixed");
    console.log(`Run ID: ${result.runId}`);
    console.log(`Status: ${result.status}`);

    if ("headline" in result) {
      console.log(`Headline: ${result.headline}`);
    }

    if ("error" in result) {
      console.log(`Failure: ${result.error}`);
    }

    console.log("Expected trace shape: researcher -> verifier -> writer, then successful output validation.");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
