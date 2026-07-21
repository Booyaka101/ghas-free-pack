// Minimal mock of the GitHub REST API for local end-to-end verification.
// Records every request to test/out/mock-requests.json and saves the PR
// comment body to test/out/pr-comment.md. Listens on 0.0.0.0:8899 so the
// action container can reach it via host.docker.internal.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const requests = [];
const comments = []; // stateful: lets a second run exercise the PATCH/update path

const server = http.createServer((req, res) => {
  let data = '';
  req.on('data', (c) => { data += c; });
  req.on('end', () => {
    let body = null;
    try { body = JSON.parse(data); } catch (e) { body = data || null; }
    requests.push({ method: req.method, url: req.url, body: body });
    fs.writeFileSync(path.join(OUT, 'mock-requests.json'), JSON.stringify(requests, null, 2));
    console.log(`[mock] ${req.method} ${req.url}`);

    res.setHeader('Content-Type', 'application/json');

    if (req.method === 'GET' && /\/issues\/\d+\/comments/.test(req.url)) {
      res.writeHead(200);
      res.end(JSON.stringify(comments));
    } else if (req.method === 'POST' && /\/issues\/\d+\/comments/.test(req.url)) {
      const c = { id: 1001 + comments.length, body: body && body.body };
      comments.push(c);
      if (c.body) fs.writeFileSync(path.join(OUT, 'pr-comment.md'), c.body);
      res.writeHead(201);
      res.end(JSON.stringify({ id: c.id, html_url: 'http://mock/comment/' + c.id }));
    } else if (req.method === 'PATCH' && /\/issues\/comments\/(\d+)/.test(req.url)) {
      const id = parseInt(req.url.match(/\/issues\/comments\/(\d+)/)[1], 10);
      const c = comments.find((x) => x.id === id);
      if (c && body && body.body) {
        c.body = body.body;
        fs.writeFileSync(path.join(OUT, 'pr-comment.md'), c.body);
      }
      res.writeHead(200);
      res.end(JSON.stringify({ id: id }));
    } else if (req.method === 'POST' && /\/code-scanning\/sarifs/.test(req.url)) {
      res.writeHead(202);
      res.end(JSON.stringify({ id: 'mock-sarif-upload-1', url: 'http://mock/sarifs/1' }));
    } else {
      res.writeHead(404);
      res.end(JSON.stringify({ message: 'mock: not found' }));
    }
  });
});

server.listen(8899, '0.0.0.0', () => console.log('[mock] GitHub API mock listening on 0.0.0.0:8899'));
