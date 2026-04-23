import { runScenario } from "./scenario";

runScenario("broken")
  .then((result) => {
    console.log("");
    console.log("Debug handoff playground");
    console.log("Mode: broken");
    console.log(`Run ID: ${result.runId}`);
    console.log(`Status: ${result.status}`);

    if ("error" in result) {
      console.log(`Failure: ${result.error}`);
    }

    console.log("Expected trace shape: direct researcher -> writer handoff, then output validation failure.");
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
