import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { statSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const outfile = join(rootDir, 'dist/cli/index.js');

console.log('[esbuild] Bundling Chatterbox CLI into a single-file ESM distribution...');
const start = Date.now();

const result = await esbuild.build({
  entryPoints: [join(rootDir, 'src/cli/index.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  banner: {
    js: `#!/usr/bin/env node\nimport { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);`,
  },
  minify: true,
  alias: {
    'react-devtools-core': join(rootDir, 'src/shims/react-devtools.ts'),
  },
  external: ['node:*'],
  metafile: true,
});

const duration = Date.now() - start;
const stats = statSync(outfile);
const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
const sizeKb = (stats.size / 1024).toFixed(1);

console.log(`[esbuild] Successfully created single-file CLI bundle in ${duration}ms:`);
console.log(`  File: ${outfile}`);
console.log(`  Size: ${sizeKb} kB (${sizeMb} MB)`);

if (result.metafile) {
  console.log('\n--- Bundle Analysis (Largest Modules) ---');
  const analysis = await esbuild.analyzeMetafile(result.metafile, { verbose: false });
  console.log(analysis);
}
