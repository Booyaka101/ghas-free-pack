// Validate the published index, allowing Buildx's non-runnable attestations.
'use strict';
const assert = require('assert');
const fs = require('fs');

function checkManifest(index) {
  assert.strictEqual(index.schemaVersion, 2, 'Expected a schema v2 index');
  assert.ok(Array.isArray(index.manifests), 'Expected a multi-platform index');
  const platforms = [];
  for (const manifest of index.manifests) {
    assert.match(manifest.digest || '', /^sha256:[a-f0-9]{64}$/, 'Invalid manifest digest');
    const platform = manifest.platform || {};
    if (platform.os === 'unknown' && platform.architecture === 'unknown' &&
        manifest.annotations?.['vnd.docker.reference.type'] === 'attestation-manifest') continue;
    platforms.push(platform.os + '/' + platform.architecture);
  }
  assert.deepStrictEqual(platforms.sort(), ['linux/amd64', 'linux/arm64'],
    'Expected exactly one runnable manifest for each supported platform');
}

if (require.main === module) {
  assert.ok(process.argv[2], 'Usage: node test/manifest-checks.js <manifest.json>');
  checkManifest(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
  console.log('PASS: published index contains linux/amd64 and linux/arm64');
}
module.exports = checkManifest;
