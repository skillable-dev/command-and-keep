// CLI over the runtime, for sessions without MCP and for human reviewers.
//   skillable-cli <tool> '<json-args>'
// Same pack, same ledger, same six operations as the MCP server.
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { loadPack } from "./pack.js";
import { Ledger } from "./ledger.js";
import { Runtime, RuntimeError } from "./runtime.js";

const here = dirname(fileURLToPath(import.meta.url));
const packDir = resolve(process.env.SKILLABLE_PACK ?? join(here, "..", "..", "skills", "command-and-keep"));
const ledgerPath = resolve(process.env.SKILLABLE_LEDGER ?? join(homedir(), ".skillable", "command-and-keep", "ledger.json"));
const rt = new Runtime(loadPack(packDir), new Ledger(ledgerPath));

const [tool, rawArgs] = process.argv.slice(2);
const args = rawArgs ? JSON.parse(rawArgs) : {};
try {
  let out: unknown;
  switch (tool) {
    case "todays_lens":
      if (args.pause !== undefined) rt.pause(args.pause);
      out = rt.todaysLens(args);
      break;
    case "start_mission":
      out = rt.startMission(args.mission_id, args.context);
      break;
    case "submit_evidence":
      out = rt.submitEvidence(args);
      break;
    case "get_feedback":
      out = rt.getFeedback(args.attempt_id);
      break;
    case "due_reviews":
      out = rt.dueReviews();
      break;
    case "credential_status":
      out = rt.credentialStatus();
      break;
    default:
      console.error("usage: skillable-cli <todays_lens|start_mission|submit_evidence|get_feedback|due_reviews|credential_status> '<json>'");
      process.exit(2);
  }
  console.log(JSON.stringify(out, null, 2));
} catch (e) {
  console.error(e instanceof RuntimeError ? e.message : (e as Error).stack);
  process.exit(1);
}
