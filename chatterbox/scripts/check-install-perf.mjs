import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

console.log('================================================================');
console.log('  Chatterbox CLI Install Performance & Package Gate');
console.log('================================================================\n');

const rootDir = resolve('.');
const maxUnpackedSize = 5 * 1024 * 1024; // 5 MB
const maxInstallDurationMs = 30000; // 30 seconds
const maxRuntimeDeps = 5; // budget: max 5, target: 0
const maxHelpDurationMs = 1500; // spawn + node startup budget on Windows

// 1. Run npm pack
console.log('[1/6] Packaging tarball with npm pack...');
const packOutput = execSync('npm pack --json', { cwd: rootDir, encoding: 'utf-8' });
const packInfo = JSON.parse(packOutput)[0];
const tarballName = packInfo.filename;
const tarballPath = join(rootDir, tarballName);
const tarballSize = packInfo.size;
const unpackedSize = packInfo.unpackedSize;
const fileCount = packInfo.entryCount;

console.log(`  Tarball:       ${tarballName}`);
console.log(`  Packed Size:   ${(tarballSize / 1024).toFixed(1)} kB`);
console.log(`  Unpacked Size: ${(unpackedSize / (1024 * 1024)).toFixed(2)} MB (${unpackedSize} bytes)`);
console.log(`  Files:         ${fileCount}`);

if (unpackedSize > maxUnpackedSize) {
  console.error(`\n[FAIL] Unpacked package size (${unpackedSize} bytes) exceeds 5 MB budget!`);
  process.exit(1);
}

// 2. Create isolated temporary directory
console.log('\n[2/6] Preparing isolated environment...');
const tempDir = mkdtempSync(join(tmpdir(), 'chatterbox-gate-'));
writeFileSync(join(tempDir, 'package.json'), JSON.stringify({ name: 'install-gate-test', version: '1.0.0' }, null, 2));

try {
  // 3. Install packed tarball
  console.log('[3/6] Measuring clean npm install duration...');
  const installStart = process.hrtime.bigint();
  const installResult = execSync(`npm install "${tarballPath}"`, {
    cwd: tempDir,
    encoding: 'utf-8',
    stdio: 'pipe',
  });
  const installDurationMs = Number(process.hrtime.bigint() - installStart) / 1e6;
  console.log(`  Install Duration: ${installDurationMs.toFixed(0)} ms (${(installDurationMs / 1000).toFixed(2)}s)`);

  if (installDurationMs > maxInstallDurationMs) {
    console.error(`\n[FAIL] Install took ${(installDurationMs / 1000).toFixed(2)}s, exceeding 30s budget!`);
    process.exit(1);
  }

  // Check for deprecated warnings in install output
  const lowerInstall = (installResult || '').toLowerCase();
  if (lowerInstall.includes('deprecated uuid') || lowerInstall.includes('deprecated prebuild-install')) {
    console.error(`\n[FAIL] Direct dependency deprecation warnings detected in install output!`);
    process.exit(1);
  }

  // 4. Count installed dependency packages
  console.log('\n[4/6] Counting installed runtime dependencies...');
  const nmDir = join(tempDir, 'node_modules');
  let installedPackages = [];
  if (existsSync(nmDir)) {
    installedPackages = readdirSync(nmDir).filter(
      (name) => name !== '.bin' && name !== 'chatterbox-cli' && !name.startsWith('.')
    );
  }
  const depCount = installedPackages.length;
  console.log(`  Runtime dependencies installed: ${depCount}`);
  if (installedPackages.length > 0) {
    console.log(`  Packages: ${installedPackages.join(', ')}`);
  }

  if (depCount > maxRuntimeDeps) {
    console.error(`\n[FAIL] Installed dependencies (${depCount}) exceed maximum allowed budget of ${maxRuntimeDeps}!`);
    process.exit(1);
  }

  // 5. Measure CLI startup latency
  console.log('\n[5/6] Measuring agentfeed --help startup latency...');
  const cliEntry = join(nmDir, 'chatterbox-cli', 'dist', 'cli', 'index.js');
  const helpStart = process.hrtime.bigint();
  const helpOutput = execSync(`node "${cliEntry}" --help`, {
    cwd: tempDir,
    encoding: 'utf-8',
    stdio: 'pipe',
  });
  const helpDurationMs = Number(process.hrtime.bigint() - helpStart) / 1e6;
  console.log(`  --help latency: ${helpDurationMs.toFixed(0)} ms`);

  if (!helpOutput.includes('Chatterbox') || !helpOutput.includes('Usage: agentfeed')) {
    console.error(`\n[FAIL] --help output missing Chatterbox banner or usage instructions!`);
    process.exit(1);
  }

  // Ensure --help created zero state in the workspace
  if (existsSync(join(tempDir, '.chatterbox'))) {
    console.error(`\n[FAIL] --help erroneously created state in .chatterbox directory!`);
    process.exit(1);
  }

  // 6. Test offline mock workflow execution
  console.log('\n[6/6] Verifying offline mock execution (agentfeed run --mock --fast)...');
  const runOutput = execSync(
    `node "${cliEntry}" run --mock --fast "Performance test goal" --approve`,
    {
      cwd: tempDir,
      encoding: 'utf-8',
      stdio: 'pipe',
    }
  );

  if (!runOutput.includes('completed successfully')) {
    console.error(`\n[FAIL] Mock workflow did not complete successfully! Output:\n${runOutput}`);
    process.exit(1);
  }
  console.log('  Mock workflow verified: completed successfully offline!');

  console.log('\n================================================================');
  console.log('  INSTALL PERFORMANCE GATE PASSED ALL CHECKS');
  console.log('================================================================');
  console.log(`  - Package Tarball Size:     ${(tarballSize / 1024).toFixed(1)} kB`);
  console.log(`  - Unpacked Size:            ${(unpackedSize / (1024 * 1024)).toFixed(2)} MB (< 5 MB budget)`);
  console.log(`  - Files in Package:         ${fileCount}`);
  console.log(`  - Clean Install Duration:   ${(installDurationMs / 1000).toFixed(2)}s (< 30s budget)`);
  console.log(`  - Runtime Dependencies:     ${depCount} (budget: <= ${maxRuntimeDeps}, target: 0)`);
  console.log(`  - --help Latency:           ${helpDurationMs.toFixed(0)} ms`);
  console.log(`  - State Isolation:          PASS (no .chatterbox on help)`);
  console.log(`  - Offline Mock Run:         PASS`);
  console.log('================================================================\n');
} finally {
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {}
}
