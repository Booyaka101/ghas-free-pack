// fingerprints.js: partialFingerprints.primaryLocationLineHash for SARIF results.
// GitHub only fills these in for uploads made through codeql-action/upload-sarif;
// a REST API upload without them can show duplicate alerts once lines move.
// Port of hash() in github/codeql-action src/fingerprints.ts, with BigInt in
// place of the `long` package. Output must stay identical to upstream's.
'use strict';

const fs = require('fs');
const path = require('path');

const TAB = 9;
const SPACE = 32;
const LF = 10;
const CR = 13;
const EOF = 65535;
const BLOCK_SIZE = 100;
const MOD = 37n;
const FIRST_MOD = BigInt.asIntN(64, MOD ** BigInt(BLOCK_SIZE));

// Calls back with (lineNumber, hash) for every line of text. Each line's hash
// covers the next BLOCK_SIZE characters, ignoring spaces and tabs.
function hashLines(text, callback) {
  const window = new Array(BLOCK_SIZE).fill(0);
  const lineNumbers = new Array(BLOCK_SIZE).fill(-1);
  const hashCounts = {};
  let hashRaw = 0n;
  let index = 0;
  let lineNumber = 0;
  let lineStart = true;
  let prevCR = false;

  function outputHash() {
    const value = BigInt.asUintN(64, hashRaw).toString(16);
    hashCounts[value] = (hashCounts[value] || 0) + 1;
    callback(lineNumbers[index], value + ':' + hashCounts[value]);
    lineNumbers[index] = -1;
  }

  function updateHash(current) {
    const begin = window[index];
    window[index] = current;
    hashRaw = BigInt.asIntN(64, MOD * hashRaw + BigInt(current) - FIRST_MOD * BigInt(begin));
    index = (index + 1) % BLOCK_SIZE;
  }

  function processCharacter(current) {
    if (current === SPACE || current === TAB || (prevCR && current === LF)) {
      prevCR = false;
      return;
    }
    if (current === CR) {
      current = LF;
      prevCR = true;
    } else {
      prevCR = false;
    }
    if (lineNumbers[index] !== -1) outputHash();
    if (lineStart) {
      lineStart = false;
      lineNumber++;
      lineNumbers[index] = lineNumber;
    }
    if (current === LF) lineStart = true;
    updateHash(current);
  }

  for (let i = 0; i < text.length; i++) processCharacter(text.charCodeAt(i));
  processCharacter(EOF);
  for (let i = 0; i < BLOCK_SIZE; i++) {
    if (lineNumbers[index] !== -1) outputHash();
    updateHash(0);
  }
}

// Adds primaryLocationLineHash to every result whose primary location is a
// readable file under root. Each file is read and hashed once.
function addFingerprints(runs, root) {
  const byFile = {};
  runs.forEach(function (run) {
    run.results.forEach(function (result) {
      const loc = result.locations[0].physicalLocation;
      const file = path.join(root, loc.artifactLocation.uri);
      (byFile[file] = byFile[file] || []).push({ result: result, line: loc.region.startLine });
    });
  });
  Object.keys(byFile).forEach(function (file) {
    let text;
    try {
      if (!fs.statSync(file).isFile()) return;
      text = fs.readFileSync(file, 'utf8');
    } catch (e) {
      return;
    }
    hashLines(text, function (lineNumber, hash) {
      byFile[file].forEach(function (entry) {
        if (entry.line === lineNumber) entry.result.partialFingerprints = { primaryLocationLineHash: hash };
      });
    });
  });
}

module.exports = { hashLines: hashLines, addFingerprints: addFingerprints };
