// main.ts — build the entry output: copy game/ + screenshots/ into the output
// directory and write dossier.json from the kit's buildDossier. Node 22 stdlib only.
// Deterministic: same input directory writes the same bytes on repeated runs.
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)));
const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const gameSrc = join(repoRoot, 'game');
const shotsSrc = join(repoRoot, 'screenshots');
const gameDst = join(outDir, 'game');
const shotsDst = join(outDir, 'screenshots');

if (!existsSync(gameSrc)) throw new Error(`no game/ directory at ${gameSrc}`);
mkdirSync(outDir, { recursive: true });
if (existsSync(gameDst)) rmSync(gameDst, { recursive: true, force: true });
if (existsSync(shotsDst)) rmSync(shotsDst, { recursive: true, force: true });
cpSync(gameSrc, gameDst, { recursive: true });
if (existsSync(shotsSrc)) cpSync(shotsSrc, shotsDst, { recursive: true });
else mkdirSync(shotsDst, { recursive: true });

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);

const gameFiles = readdirSync(gameDst, { recursive: true });
const shotFiles = readdirSync(shotsDst, { recursive: true });
console.log(`wrote ${outDir}`);
console.log(`game/: ${gameFiles.length} entries copied`);
console.log(`screenshots/: ${shotFiles.length} entries copied`);
console.log(`dossier.json: ${dossier.length} bytes`);
