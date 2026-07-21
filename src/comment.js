// comment.js — turn /tmp/results.sarif into a Markdown summary, write it to the
// job step summary, post/update a PR comment, and best-effort upload the SARIF
// to GitHub code scanning (works on public repos; private repos need GHAS).
// Runs on Node 12 (Ubuntu 22.04 apt nodejs) — no optional chaining, no fetch.
'use strict';

const fs = require('fs');
const zlib = require('zlib');
const http = require('http');
const https = require('https');
const urlmod = require('url');

const MARKER = '<!-- ghas-free-pack -->';
const EMOJI = { error: '\u{1F534}', warning: '\u{1F7E0}', note: '\u{1F535}' };
const MAX_ROWS_PER_TOOL = 30;

const TOKEN = process.env['INPUT_GITHUB-TOKEN'] || process.env.GITHUB_TOKEN || '';
const API = (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/+$/, '');
const REPO = process.env.GITHUB_REPOSITORY || '';

function request(method, url, body, extraHeaders) {
  return new Promise(function (resolve) {
    const u = urlmod.parse(url);
    const mod = u.protocol === 'http:' ? http : https;
    const headers = {
      'User-Agent': 'ghas-free-pack',
      'Accept': 'application/vnd.github+json',
      'Authorization': 'Bearer ' + TOKEN
    };
    if (extraHeaders) Object.keys(extraHeaders).forEach(function (k) { headers[k] = extraHeaders[k]; });
    let payload = null;
    if (body !== undefined && body !== null) {
      payload = Buffer.from(JSON.stringify(body));
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = payload.length;
    }
    const req = mod.request({
      hostname: u.hostname, port: u.port, path: u.path, method: method, headers: headers
    }, function (res) {
      let data = '';
      res.on('data', function (c) { data += c; });
      res.on('end', function () {
        let parsed = null;
        try { parsed = JSON.parse(data); } catch (e) { /* non-JSON body */ }
        resolve({ status: res.statusCode, body: parsed, raw: data });
      });
    });
    req.on('error', function (e) { resolve({ status: 0, body: null, raw: String(e) }); });
    if (payload) req.write(payload);
    req.end();
  });
}

function mdEscape(s) {
  return String(s).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').slice(0, 300);
}

function buildMarkdown(sarif) {
  const lines = [MARKER, '## \u{1F6E1}️ ghas-free-pack — security scan', ''];
  let totals = { error: 0, warning: 0, note: 0, all: 0 };

  sarif.runs.forEach(function (run) {
    run.results.forEach(function (r) {
      totals[r.level] = (totals[r.level] || 0) + 1;
      totals.all++;
    });
  });

  if (totals.all === 0) {
    lines.push('✅ **No issues found** in Shell/Bash, Dockerfile, Terraform or PHP files.');
  } else {
    lines.push('**' + totals.all + ' finding(s)** — ' +
      EMOJI.error + ' ' + totals.error + ' error(s) · ' +
      EMOJI.warning + ' ' + totals.warning + ' warning(s) · ' +
      EMOJI.note + ' ' + totals.note + ' note(s)');
    lines.push('');

    sarif.runs.forEach(function (run) {
      const tool = run.tool.driver.name;
      const results = run.results;
      if (!results.length) {
        lines.push('### ' + tool + ' — ✅ clean');
        lines.push('');
        return;
      }
      const helpUris = {};
      (run.tool.driver.rules || []).forEach(function (rule) {
        if (rule.helpUri) helpUris[rule.id] = rule.helpUri;
      });
      lines.push('### ' + tool + ' — ' + results.length + ' finding(s)');
      lines.push('');
      lines.push('| | Rule | File | Line | Message |');
      lines.push('|---|------|------|-----:|---------|');
      results.slice(0, MAX_ROWS_PER_TOOL).forEach(function (r) {
        const loc = r.locations[0].physicalLocation;
        const rule = helpUris[r.ruleId]
          ? '[' + r.ruleId + '](' + helpUris[r.ruleId] + ')'
          : r.ruleId;
        lines.push('| ' + (EMOJI[r.level] || EMOJI.note) + ' | ' + rule +
          ' | `' + mdEscape(loc.artifactLocation.uri) + '` | ' +
          loc.region.startLine + ' | ' + mdEscape(r.message.text) + ' |');
      });
      if (results.length > MAX_ROWS_PER_TOOL) {
        lines.push('');
        lines.push('_…and ' + (results.length - MAX_ROWS_PER_TOOL) + ' more ' + tool + ' finding(s)._');
      }
      lines.push('');
    });
  }

  lines.push('---');
  lines.push('_Free scanning for **Shell/Bash, Dockerfiles, Terraform HCL and PHP** — the file types GitHub’s' +
    ' AI security detections only cover with paid Advanced Security ·' +
    ' powered by ShellCheck, Hadolint, tfsec and PHPStan._');
  return lines.join('\n');
}

function readEvent() {
  const p = process.env.GITHUB_EVENT_PATH;
  if (!p || !fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}

function prNumber(event) {
  if (!event) return null;
  if (event.pull_request && event.pull_request.number) return event.pull_request.number;
  if (event.issue && event.issue.number && event.issue.pull_request) return event.issue.number;
  return null;
}

async function postOrUpdateComment(markdown, pr) {
  const base = API + '/repos/' + REPO + '/issues/' + pr + '/comments';
  const existing = await request('GET', base + '?per_page=100');
  let commentId = null;
  if (existing.status === 200 && Array.isArray(existing.body)) {
    existing.body.forEach(function (c) {
      if (c.body && c.body.indexOf(MARKER) !== -1) commentId = c.id;
    });
  }
  if (commentId) {
    const res = await request('PATCH', API + '/repos/' + REPO + '/issues/comments/' + commentId, { body: markdown });
    console.log(res.status >= 200 && res.status < 300
      ? 'comment.js: updated existing PR comment ' + commentId
      : '::warning::failed to update PR comment (HTTP ' + res.status + '): ' + res.raw.slice(0, 200));
  } else {
    const res = await request('POST', base, { body: markdown });
    console.log(res.status >= 200 && res.status < 300
      ? 'comment.js: posted PR comment to #' + pr
      : '::warning::failed to post PR comment (HTTP ' + res.status + '): ' + res.raw.slice(0, 200));
  }
}

async function uploadSarif(sarifRaw, event) {
  let sha = process.env.GITHUB_SHA || '';
  let ref = process.env.GITHUB_REF || '';
  if (event && event.pull_request && event.pull_request.head) {
    sha = event.pull_request.head.sha || sha;
    ref = 'refs/pull/' + event.pull_request.number + '/head';
  }
  if (!sha || !ref) {
    console.log('comment.js: no commit sha/ref available, skipping SARIF upload');
    return;
  }
  const res = await request('POST', API + '/repos/' + REPO + '/code-scanning/sarifs', {
    commit_sha: sha,
    ref: ref,
    sarif: zlib.gzipSync(Buffer.from(sarifRaw)).toString('base64'),
    tool_name: 'ghas-free-pack'
  });
  if (res.status === 202) {
    console.log('comment.js: SARIF uploaded to code scanning (visible under Security > Code scanning)');
  } else if (res.status === 403) {
    console.log('comment.js: SARIF upload not permitted (HTTP 403) — code scanning upload needs a public repo ' +
      'or GHAS, and the workflow needs `security-events: write` permission. The PR comment above still has all findings.');
  } else {
    console.log('comment.js: SARIF upload skipped (HTTP ' + res.status + '): ' + String(res.raw).slice(0, 200));
  }
}

async function main() {
  if (!fs.existsSync('/tmp/results.sarif')) {
    console.log('comment.js: no /tmp/results.sarif, nothing to report');
    return;
  }
  const sarifRaw = fs.readFileSync('/tmp/results.sarif', 'utf8');
  const sarif = JSON.parse(sarifRaw);
  const markdown = buildMarkdown(sarif);

  // Always publish to the job step summary — works on every event type.
  if (process.env.GITHUB_STEP_SUMMARY) {
    try {
      fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown.replace(MARKER, '') + '\n');
      console.log('comment.js: wrote job step summary');
    } catch (e) {
      console.log('::warning::could not write step summary: ' + e.message);
    }
  }

  if (!TOKEN || !REPO) {
    console.log('comment.js: no GITHUB_TOKEN/GITHUB_REPOSITORY — skipping PR comment and SARIF upload');
    return;
  }

  const event = readEvent();
  const pr = prNumber(event);
  if (pr) {
    await postOrUpdateComment(markdown, pr);
  } else {
    console.log('comment.js: not a pull_request event, skipping PR comment');
  }

  await uploadSarif(sarifRaw, event);
}

main().catch(function (e) {
  console.log('::warning::comment.js failed: ' + (e && e.stack ? e.stack : e));
  process.exitCode = 0; // reporting problems must not fail the scan itself
});
