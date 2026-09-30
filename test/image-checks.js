// Extra runs of the built image, offline and with HOME=/github/home as on a
// GitHub runner: the enable-tfsec alias, Trivy skipping vendor/, and where
// findings inside a downloaded Terraform module get reported.
// Usage: node image-checks.js [image]   (default ghas-free-pack:local)
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const IMAGE = process.argv[2] || 'ghas-free-pack:local';
const DEPRECATION = '::warning::enable-tfsec is deprecated';
const failures = [];

function check(name, cond) {
  console.log((cond ? '  PASS' : '  FAIL') + ' - ' + name);
  if (!cond) failures.push(name);
}

function run(workspace, inputs, artifactDir) {
  const args = ['run', '--rm', '--network', 'none',
    '-v', path.join(__dirname, workspace) + ':/github/workspace:ro',
    '-e', 'GITHUB_WORKSPACE=/github/workspace',
    '-e', 'HOME=/github/home',
    '-e', 'INPUT_ENABLE-SHELLCHECK=false',
    '-e', 'INPUT_ENABLE-HADOLINT=false'];
  if (artifactDir) args.push('-v', artifactDir + ':/artifacts', '-e', 'GFP_ARTIFACT_DIR=/artifacts');
  Object.keys(inputs).forEach(k => args.push('-e', 'INPUT_' + k + '=' + inputs[k]));
  const r = spawnSync('docker', args.concat(IMAGE), { encoding: 'utf8' });
  if (r.error) throw r.error;
  const log = r.stdout + r.stderr;
  return {
    log: log,
    trivyRan: /^trivy: \d+ file\(s\)$/m.test(log),
    warnings: log.split(DEPRECATION).length - 1
  };
}

console.log('\n=== image checks (' + IMAGE + ') ===');

// The runner sends every input that has a default, so the current action.yml
// always sets ENABLE-TRIVY, and the 1.0.x one always sets ENABLE-TFSEC instead.
const plain = run('fixtures', { 'ENABLE-TRIVY': 'true' });
check('defaults: Trivy runs, no deprecation warning', plain.trivyRan && plain.warnings === 0);
check('offline with HOME=/github/home: baked checks bundle is used',
  plain.log.indexOf('loading from existing cache') !== -1 && plain.log.indexOf('Falling back to embedded checks') === -1);

const tfsecOn = run('fixtures', { 'ENABLE-TRIVY': 'true', 'ENABLE-TFSEC': 'true' });
check("enable-tfsec: 'true' runs Trivy and warns once", tfsecOn.trivyRan && tfsecOn.warnings === 1);

const tfsecOff = run('fixtures', { 'ENABLE-TRIVY': 'true', 'ENABLE-TFSEC': 'false' });
check("enable-tfsec: 'false' skips Trivy and warns once", !tfsecOff.trivyRan && tfsecOff.warnings === 1);

const trivyOff = run('fixtures', { 'ENABLE-TRIVY': 'false' });
check("enable-trivy: 'false' skips Trivy without a warning", !trivyOff.trivyRan && trivyOff.warnings === 0);

const oldOn = run('fixtures', { 'ENABLE-TFSEC': 'true' });
check('1.0.x action.yml on this image: Trivy runs, no warning', oldOn.trivyRan && oldOn.warnings === 0);

const oldOff = run('fixtures', { 'ENABLE-TFSEC': 'false' });
check("1.0.x action.yml with enable-tfsec: 'false': Trivy skipped, no warning", !oldOff.trivyRan && oldOff.warnings === 0);

const moduleOut = path.join(__dirname, 'out', 'module');
fs.rmSync(moduleOut, { recursive: true, force: true });
fs.mkdirSync(moduleOut, { recursive: true });
run('module-fixture', {}, moduleOut);
let moduleResults = [];
try {
  moduleResults = JSON.parse(fs.readFileSync(path.join(moduleOut, 'results.sarif'), 'utf8')).runs[0].results;
} catch (e) { /* checked below */ }
const ingress = moduleResults.find(r => r.ruleId === 'AWS-0107');
const loc = ingress && ingress.locations[0].physicalLocation;
check('downloaded-module finding is reported at the module call (main.tf:4)',
  !!loc && loc.artifactLocation.uri === 'main.tf' && loc.region.startLine === 4);
check('vendor/ is not scanned by Trivy',
  moduleResults.length > 0 && !moduleResults.some(r => r.locations[0].physicalLocation.artifactLocation.uri.indexOf('vendor/') === 0));

console.log('');
if (failures.length) {
  console.error('RESULT: ' + failures.length + ' image check(s) FAILED');
  process.exit(1);
}
console.log('RESULT: all image checks passed');
