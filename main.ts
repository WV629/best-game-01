// Entry point for the make.fun game harness (see competition RULES.txt).
// Copies this repo's game/ and screenshots/ into /output (or
// MAKEFUN_OUTPUT_DIR when set), then writes /output/dossier.json with the
// vendored buildDossier. The output must be byte-identical across runs: the
// copies are plain file copies, the dossier is the library's canonical bytes,
// and no timestamps are recorded anywhere.

import { cp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The repository is the directory this file lives in — never process.cwd():
// the grader runs `node /bot/main.ts` from an arbitrary working directory.
const repo = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

await mkdir(out, { recursive: true });
await cp(join(repo, 'game'), join(out, 'game'), { recursive: true });
await cp(join(repo, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// buildDossier returns the dossier as canonical JSON bytes; write them as-is
// so dossier.json matches exactly what the scorer's own call would produce.
const dossierBytes = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
await writeFile(join(out, 'dossier.json'), dossierBytes);

const dossier = JSON.parse(Buffer.from(dossierBytes).toString('utf8'));
const sourceLine = dossier.text.match(/Source files: (\d+) \((\d+) bytes\)/);
const gameFiles = sourceLine ? Number(sourceLine[1]) : 0;
const gameBytes = sourceLine ? Number(sourceLine[2]) : 0;
const within = gameFiles <= 993 && gameBytes <= 50331648;
console.log(`game: ${gameFiles} source files, ${gameBytes} bytes — ${within ? 'within budget' : 'OVER BUDGET'}`);
console.log(`screenshots: ${dossier.images.length} images, cover ${dossier.cover}`);
console.log(`dossier: ${dossierBytes.length} bytes`);
