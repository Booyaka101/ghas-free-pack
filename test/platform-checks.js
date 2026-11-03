// Execute every scanner offline, not just inspect the image's platform label.
// Usage: node test/platform-checks.js [image] [amd64|arm64]
'use strict';
const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const IMAGE = process.argv[2] || 'ghas-free-pack:local';
const ARCH = process.argv[3] || (process.arch === 'arm64' ? 'arm64' : 'amd64');
assert.ok(['amd64', 'arm64'].includes(ARCH), 'Expected amd64 or arm64');
const docker = args => execFileSync('docker', args, { encoding: 'utf8' }).trim();
assert.strictEqual(docker(['image', 'inspect', '--format', '{{.Architecture}}', IMAGE]), ARCH);
const run = command => docker(['run', '--rm', '--platform', 'linux/' + ARCH, '--network', 'none',
  '--entrypoint', '/bin/bash', IMAGE, '-euc', command]);
assert.strictEqual(run('node -p process.arch'), ARCH === 'amd64' ? 'x64' : 'arm64');
const dockerfile = fs.readFileSync(path.join(__dirname, '..', 'Dockerfile'), 'utf8');
for (const scanner of ['shellcheck', 'hadolint', 'trivy', 'phpstan']) {
  const version = run(scanner + ' --version');
  assert.ok(version, scanner + ' did not report its version');
  if (scanner !== 'shellcheck') {
    const pin = dockerfile.match(new RegExp('^ARG ' + scanner.toUpperCase() + '_VERSION=(\\S+)$', 'm'));
    assert.ok(pin, scanner + ' version pin is missing');
    assert.ok(version.split(/\s+/).includes(pin[1]), scanner + ' version does not match ' + pin[1]);
  }
  console.log('PASS: ' + scanner + ' executes on linux/' + ARCH);
}
console.log('RESULT: image and scanner runtime checks passed for linux/' + ARCH);
