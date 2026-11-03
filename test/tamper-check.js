// A pinned digest that does not match the download must fail `docker build`.
// Each case rebuilds with one pin replaced; the apt layer comes from cache.
// Usage: node tamper-check.js
'use strict';
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ZEROS = '0'.repeat(64);
const ARCH = process.argv[2] || (process.arch === 'arm64' ? 'arm64' : 'amd64');
if (!['amd64', 'arm64'].includes(ARCH)) throw new Error('Expected amd64 or arm64');
const pin = name => name + (ARCH === 'arm64' ? '_ARM64' : '') + '_SHA256';
const CASES = [
  [pin('HADOLINT'), ZEROS, 'computed checksum did NOT match'],
  ['PHPSTAN_SHA256', ZEROS, 'computed checksum did NOT match'],
  [pin('TRIVY'), ZEROS, 'computed checksum did NOT match'],
  ['TARGETARCH', 'unsupported', 'Unsupported target architecture: unsupported'],
  // The step header echoes the unexpanded command, so match the expanded digest.
  ['TRIVY_CHECKS_DIGEST', 'sha256:' + ZEROS, 'trivy-checks bundle sha256:' + ZEROS + ' was not installed']
];
const failures = [];

console.log('\n=== tampered pins must fail the build ===');
CASES.forEach(function ([arg, value, expected]) {
  const r = spawnSync('docker', ['build', '--platform', 'linux/' + ARCH, '--progress=plain', '--build-arg', arg + '=' + value, ROOT],
    { encoding: 'utf8' });
  if (r.error) throw r.error;
  const log = r.stdout + r.stderr;
  const ok = r.status !== 0 && log.indexOf(expected) !== -1;
  console.log((ok ? '  PASS' : '  FAIL') + ' - ' + arg + ' tampered: build exit ' + r.status +
    (log.indexOf(expected) !== -1 ? ', "' + expected + '"' : ', expected message missing'));
  if (!ok) {
    failures.push(arg);
    console.log(log.trim().split('\n').slice(-20).map(l => '      ' + l).join('\n'));
  }
});

console.log('');
if (failures.length) {
  console.error('RESULT: ' + failures.length + ' tamper check(s) FAILED');
  process.exit(1);
}
console.log('RESULT: every tampered pin failed the build');
