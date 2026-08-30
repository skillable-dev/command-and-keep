// Compile the pack folder into a single TypeScript module that the remote
// (Deno / Supabase Edge) runtime can import without filesystem access.
//
//   npm run embed -- ../../skillable/supabase/functions/_shared/packs
//
// The pack folder stays the single source of truth; this artifact is generated
// and committed so the edge function is self-contained.
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { loadPack, validatePack } from "./pack.js";

const here = dirname(fileURLToPath(import.meta.url));
const packDir = resolve(process.env.SKILLABLE_PACK ?? join(here, "..", "..", "skills", "command-and-keep"));
const outDir = resolve(process.argv[2] ?? join(here, "..", "dist"));

const pack = loadPack(packDir);
const problems = validatePack(pack);
if (problems.length) {
  console.error(`Refusing to embed: pack fails ${problems.length} gate(s):\n - ${problems.join("\n - ")}`);
  process.exit(1);
}

// `root` is a local filesystem path and must not leak into the artifact.
const { root: _root, ...embeddable } = pack;

const banner = `// GENERATED FILE — do not edit by hand.
// Source: command-and-keep/skills/command-and-keep (pack version ${pack.campaign.version})
// Regenerate with: npm run embed -- <output dir>   (in the command-and-keep repo)
`;

const body = `${banner}
import type { EmbeddedPack } from "./types.ts";

export const COMMAND_AND_KEEP_PACK: EmbeddedPack = ${JSON.stringify(embeddable, null, 2)} as const;

export default COMMAND_AND_KEEP_PACK;
`;

mkdirSync(outDir, { recursive: true });
const outFile = join(outDir, "command-and-keep.generated.ts");
writeFileSync(outFile, body);

const missions = Object.keys(embeddable.missions).length;
console.log(`Embedded '${pack.skill.name}' v${pack.campaign.version}: ${embeddable.capabilities.length} capabilities, ${missions} missions, ${embeddable.misconceptions.length} misconceptions`);
console.log(`→ ${outFile} (${(body.length / 1024).toFixed(0)} kB)`);
