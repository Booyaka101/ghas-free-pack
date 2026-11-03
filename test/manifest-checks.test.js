'use strict';
const { test } = require('node:test');
const assert = require('assert');
const checkManifest = require('./manifest-checks');
const descriptor = architecture => ({ digest: 'sha256:' + 'a'.repeat(64),
  platform: { os: 'linux', architecture } });
const index = (...manifests) => ({ schemaVersion: 2, manifests });

test('accepts both architectures in either order', () => {
  checkManifest(index(descriptor('arm64'), descriptor('amd64')));
});
test('accepts Buildx attestations alongside both architectures', () => {
  checkManifest(index(descriptor('amd64'), descriptor('arm64'), {
    digest: 'sha256:' + 'b'.repeat(64),
    platform: { os: 'unknown', architecture: 'unknown' },
    annotations: { 'vnd.docker.reference.type': 'attestation-manifest' }
  }));
});
for (const [name, value] of [
  ['missing ARM64', index(descriptor('amd64'))],
  ['duplicate architecture', index(descriptor('amd64'), descriptor('arm64'), descriptor('arm64'))],
  ['unexpected architecture', index(descriptor('amd64'), descriptor('arm64'), descriptor('ppc64le'))],
  ['unidentified descriptor', index(descriptor('amd64'), descriptor('arm64'), {
    digest: 'sha256:' + 'c'.repeat(64), platform: { os: 'unknown', architecture: 'unknown' }
  })],
  ['invalid digest', index(descriptor('amd64'), { ...descriptor('arm64'), digest: 'invalid' })],
  ['single-platform manifest', { schemaVersion: 2, config: {} }],
  ['wrong schema', { ...index(descriptor('amd64'), descriptor('arm64')), schemaVersion: 1 }]
]) {
  test('rejects ' + name, () => assert.throws(() => checkManifest(value)));
}
