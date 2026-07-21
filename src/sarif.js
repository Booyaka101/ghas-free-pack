// sarif.js — merge raw scanner output (/tmp/sc.json, /tmp/hd.json, /tmp/tf.json,
// /tmp/php.json) into a single SARIF 2.1.0 file at /tmp/results.sarif, plus
// /tmp/counts.json used by entrypoint.sh for the exit code.
// Runs on Node 12 (Ubuntu 22.04 apt nodejs) — no optional chaining, no fetch.
'use strict';

const fs = require('fs');
const path = require('path');

const WORKSPACE = process.env.GITHUB_WORKSPACE || process.cwd();

function readJson(file) {
  try {
    if (!fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf8').trim();
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    console.log('::warning::could not parse ' + file + ': ' + e.message);
    return null;
  }
}

function relativize(p) {
  if (!p) return 'unknown';
  let out = String(p).replace(/\\/g, '/');
  const ws = WORKSPACE.replace(/\\/g, '/').replace(/\/+$/, '');
  if (out.indexOf(ws + '/') === 0) out = out.slice(ws.length + 1);
  if (out.indexOf('./') === 0) out = out.slice(2);
  return out;
}

// Map each tool's severity vocabulary onto SARIF's error/warning/note.
function scLevel(level) {
  if (level === 'error') return 'error';
  if (level === 'warning') return 'warning';
  return 'note'; // info, style
}
function tfsecLevel(severity) {
  const s = String(severity || '').toUpperCase();
  if (s === 'CRITICAL' || s === 'HIGH') return 'error';
  if (s === 'MEDIUM') return 'warning';
  return 'note';
}

function makeResult(ruleId, level, message, uri, startLine) {
  return {
    ruleId: String(ruleId),
    level: level,
    message: { text: String(message) },
    locations: [{
      physicalLocation: {
        artifactLocation: { uri: relativize(uri), uriBaseId: '%SRCROOT%' },
        region: { startLine: Math.max(1, parseInt(startLine, 10) || 1) }
      }
    }]
  };
}

function makeRun(name, informationUri, results, helpUriFor) {
  const ruleIds = {};
  results.forEach(function (r) { ruleIds[r.ruleId] = true; });
  const rules = Object.keys(ruleIds).sort().map(function (id) {
    const rule = { id: id, name: id.replace(/[^A-Za-z0-9]/g, '') };
    const help = helpUriFor(id);
    if (help) rule.helpUri = help;
    return rule;
  });
  return {
    tool: {
      driver: {
        name: name,
        informationUri: informationUri,
        rules: rules
      }
    },
    columnKind: 'utf16CodeUnits',
    originalUriBaseIds: { '%SRCROOT%': { uri: 'file:///github/workspace/' } },
    results: results
  };
}

const runs = [];
const counts = { errors: 0, warnings: 0, notes: 0, total: 0, byTool: {} };

function tally(tool, results) {
  const t = { errors: 0, warnings: 0, notes: 0 };
  results.forEach(function (r) {
    if (r.level === 'error') { t.errors++; counts.errors++; }
    else if (r.level === 'warning') { t.warnings++; counts.warnings++; }
    else { t.notes++; counts.notes++; }
    counts.total++;
  });
  counts.byTool[tool] = t;
}

// ---------------------------------------------------------------- shellcheck
const sc = readJson('/tmp/sc.json');
if (sc && Array.isArray(sc)) {
  const results = sc.map(function (f) {
    return makeResult('SC' + f.code, scLevel(f.level), f.message, f.file, f.line);
  });
  runs.push(makeRun('ShellCheck', 'https://www.shellcheck.net/', results, function (id) {
    return 'https://www.shellcheck.net/wiki/' + id;
  }));
  tally('ShellCheck', results);
}

// ------------------------------------------------------------------ hadolint
const hd = readJson('/tmp/hd.json');
if (hd && Array.isArray(hd)) {
  const results = hd.map(function (f) {
    return makeResult(f.code, scLevel(f.level), f.message, f.file, f.line);
  });
  runs.push(makeRun('Hadolint', 'https://github.com/hadolint/hadolint', results, function (id) {
    if (id.indexOf('DL') === 0) return 'https://github.com/hadolint/hadolint/wiki/' + id;
    if (id.indexOf('SC') === 0) return 'https://www.shellcheck.net/wiki/' + id;
    return null;
  }));
  tally('Hadolint', results);
}

// --------------------------------------------------------------------- tfsec
const tf = readJson('/tmp/tf.json');
if (tf && Array.isArray(tf.results)) {
  const helpUris = {};
  const results = tf.results.filter(function (f) {
    return String(f.status) !== '1'; // 0/undefined = failed check; 1 = passed
  }).map(function (f) {
    const loc = f.location || {};
    const msg = (f.rule_description || f.description || f.rule_id) +
      (f.severity ? ' [' + f.severity + ']' : '') +
      (f.resolution ? ' Resolution: ' + f.resolution : '');
    if (Array.isArray(f.links) && f.links.length) helpUris[f.rule_id] = f.links[0];
    return makeResult(f.rule_id, tfsecLevel(f.severity), msg, loc.filename, loc.start_line);
  });
  runs.push(makeRun('tfsec', 'https://github.com/aquasecurity/tfsec', results, function (id) {
    return helpUris[id] || 'https://avd.aquasec.com/misconfig/' + id;
  }));
  tally('tfsec', results);
}

// ------------------------------------------------------------------- phpstan
const php = readJson('/tmp/php.json');
if (php && php.files) {
  const results = [];
  Object.keys(php.files).forEach(function (file) {
    const messages = php.files[file].messages || [];
    messages.forEach(function (m) {
      const ruleId = m.identifier || 'phpstan';
      results.push(makeResult(ruleId, 'error', m.message, file, m.line));
    });
  });
  if (Array.isArray(php.errors)) {
    php.errors.forEach(function (msg) {
      results.push(makeResult('phpstan.internal', 'warning', msg, 'unknown', 1));
    });
  }
  runs.push(makeRun('PHPStan', 'https://phpstan.org/', results, function () {
    return 'https://phpstan.org/error-identifiers';
  }));
  tally('PHPStan', results);
}

const sarif = {
  $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
  version: '2.1.0',
  runs: runs
};

fs.writeFileSync('/tmp/results.sarif', JSON.stringify(sarif, null, 2));
fs.writeFileSync('/tmp/counts.json', JSON.stringify(counts, null, 2));

console.log('sarif.js: wrote /tmp/results.sarif (' + runs.length + ' run(s), ' +
  counts.total + ' finding(s): ' + counts.errors + ' error, ' +
  counts.warnings + ' warning, ' + counts.notes + ' note)');
