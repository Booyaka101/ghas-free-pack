// Acceptance checks for the local end-to-end run (test/run-local.ps1).
// Usage: node assert.js <action-exit-code>
'use strict';
const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

const OUT = path.join(__dirname, 'out');
const failures = [];

function check(name, cond, extra) {
  console.log((cond ? '  PASS' : '  FAIL') + ' - ' + name + (extra ? '  [' + extra + ']' : ''));
  if (!cond) failures.push(name);
}
function readJson(f) {
  try { return JSON.parse(fs.readFileSync(path.join(OUT, f), 'utf8')); } catch (e) { return null; }
}

console.log('\n=== ghas-free-pack acceptance checks ===');

// (2) shellcheck: `export $INPUT` / `eval $INPUT` fixture triggers SC2163
const sc = readJson('sc.json');
check('shellcheck produced JSON output', Array.isArray(sc), sc ? sc.length + ' findings' : 'missing');
check('SC2163 detected in insecure.sh', Array.isArray(sc) && sc.some(f => f.code === 2163));

// (1) hadolint: Dockerfile with root USER triggers DL3002 warning
const hd = readJson('hd.json');
check('hadolint produced JSON output', Array.isArray(hd), hd ? hd.length + ' findings' : 'missing');
check('DL3002 detected in fixture Dockerfile', Array.isArray(hd) && hd.some(f => f.code === 'DL3002'));

// (3) Trivy: the 0.0.0.0/0 SSH ingress is AWS-0107 at HIGH (or CRITICAL)
const trivyFindings = report => report && Array.isArray(report.Results) ? report.Results.flatMap(r =>
  (r.Misconfigurations || []).map(m => Object.assign({ Target: r.Target }, m))) : [];
const misconfigs = trivyFindings(readJson('tv.json'));
const ingress = misconfigs.find(m => m.ID === 'AWS-0107' && m.Status === 'FAIL');
check('trivy produced JSON output', misconfigs.length > 0, misconfigs.length + ' findings');
check('open 0.0.0.0/0 ingress flagged HIGH/CRITICAL as AWS-0107',
  !!ingress && /^(HIGH|CRITICAL)$/.test(ingress.Severity), ingress ? ingress.ID + '=' + ingress.Severity : 'none');

// A Trivy or checks-bundle bump that changes what the fixture yields should be
// a deliberate re-record of fixtures/trivy.json, not a silent drift.
const signature = list => list.map(m => [m.Target, m.ID, m.Severity, m.CauseMetadata && m.CauseMetadata.StartLine].join(':')).sort();
const expected = signature(trivyFindings(
  JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'trivy.json'), 'utf8'))));
const actual = signature(misconfigs);
check('trivy findings match recorded fixtures/trivy.json', JSON.stringify(actual) === JSON.stringify(expected),
  actual.length + ' vs ' + expected.length + ' recorded');

// phpstan: type errors detected
const php = readJson('php.json');
check('phpstan produced JSON output with errors', !!(php && php.totals && (php.totals.file_errors || php.totals.errors) > 0),
  php && php.totals ? JSON.stringify(php.totals) : 'missing');

// (4) SARIF exists, has runs for all 4 tools, validates against the 2.1.0 schema
const sarif = readJson('results.sarif');
check('results.sarif written', !!sarif);
const toolNames = sarif ? sarif.runs.map(r => r.tool.driver.name).sort() : [];
check('SARIF has runs for all 4 tools', toolNames.join() === 'Hadolint,PHPStan,ShellCheck,Trivy', toolNames.join(', '));
if (sarif) {
  const trivyRun = sarif.runs.find(r => r.tool.driver.name === 'Trivy');
  const sarifIngress = trivyRun && trivyRun.results.find(r => r.ruleId === 'AWS-0107');
  check('AWS-0107 is an error-level SARIF result', !!sarifIngress && sarifIngress.level === 'error',
    sarifIngress ? sarifIngress.level : 'missing');

  const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'sarif-schema-2.1.0.json'), 'utf8'));
  const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
  const validate = ajv.compile(schema);
  const valid = validate(sarif);
  check('SARIF validates against SARIF 2.1.0 JSON schema', valid,
    valid ? 'ajv draft-07' : JSON.stringify((validate.errors || []).slice(0, 3)));
}

// (5) PR comment posted with summary table
let comment = null;
try { comment = fs.readFileSync(path.join(OUT, 'pr-comment.md'), 'utf8'); } catch (e) { /* absent */ }
check('PR comment posted to mock GitHub API', !!comment);
check('comment contains markdown summary table', !!comment && comment.indexOf('| Rule |') !== -1);
check('comment mentions SC2163 and DL3002', !!comment && comment.indexOf('SC2163') !== -1 && comment.indexOf('DL3002') !== -1);

const reqs = readJson('mock-requests.json') || [];
check('SARIF upload attempted against code-scanning API',
  reqs.some(r => r.method === 'POST' && r.url.indexOf('/code-scanning/sarifs') !== -1));
const sarifReq = reqs.find(r => r.method === 'POST' && r.url.indexOf('/code-scanning/sarifs') !== -1);
check('SARIF upload payload has commit_sha, ref and gzip+base64 sarif',
  !!(sarifReq && sarifReq.body && sarifReq.body.commit_sha && sarifReq.body.ref && sarifReq.body.sarif));

// step summary + exit code semantics
check('job step summary written', fs.existsSync(path.join(OUT, 'step-summary.md')));
check('action exited 1 (fixtures contain error-level findings)', process.argv[2] === '1', 'got ' + process.argv[2]);

console.log('');
if (failures.length) {
  console.error('RESULT: ' + failures.length + ' check(s) FAILED');
  process.exit(1);
}
console.log('RESULT: all checks passed ✅');
