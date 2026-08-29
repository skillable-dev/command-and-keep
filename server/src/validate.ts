// CLI: validate a pack against the publishing gates. Exit 1 on failure.
import { resolve } from "node:path";
import { loadPack, validatePack } from "./pack.js";

const dir = resolve(process.argv[2] ?? ".");
const pack = loadPack(dir);
const problems = validatePack(pack);
const caps = pack.capabilities.length;
const missions = Object.values(pack.missions);
console.log(`Pack: ${pack.skill.name} v${pack.campaign.version} — ${caps} capabilities, ${missions.length} missions (${missions.filter((m) => m.kind === "transfer").length} transfer), ${pack.misconceptions.length} misconceptions, ${pack.campaign.duration_days} days`);
if (problems.length === 0) {
  console.log("All publishing gates pass.");
} else {
  console.log(`${problems.length} problem(s):`);
  for (const p of problems) console.log(` - ${p}`);
  process.exit(1);
}
