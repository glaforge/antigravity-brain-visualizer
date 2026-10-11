/*
 * Copyright 2026 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

// Node.js SidecarApp supervisor & reverse proxy for Antigravity Brain Visualizer.
// Spawns the bundled GraalVM native executable (bin/agy-brain-viz) on a dedicated
// internal loopback port and proxies UI + REST requests while preserving
// SidecarApp's /preload.js and /_sidecar/* host bridge endpoints.
// Strictly fails fast with rich diagnostic output if the native binary is missing or exits.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { createServer as createNetServer } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SidecarApp } from 'sidecar_sdk';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.ANTIGRAVITY_EXECUTABLE_DATA_DIR || join(HERE, '.data');
const BINARY_NAME = process.platform === 'win32' ? 'agy-brain-viz.exe' : 'agy-brain-viz';
const BINARY_PATH = join(HERE, 'bin', BINARY_NAME);
const UI_TOKEN = process.env.ANTIGRAVITY_SIDECAR_UI_TOKEN || '';

const MAX_LOG_LINES = 120;
const logBuffer = [];

function appendLog(streamName, chunk) {
  const text = String(chunk);
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  for (const line of lines) {
    const entry = `[${new Date().toISOString()}] [${streamName}] ${line}`;
    logBuffer.push(entry);
    if (logBuffer.length > MAX_LOG_LINES) {
      logBuffer.shift();
    }
    if (streamName === 'ERR') {
      console.error(entry);
    } else {
      console.log(entry);
    }
  }
}

let backendState = {
  status: 'starting',
  port: null,
  pid: null,
  binaryPath: BINARY_PATH,
  errorReason: null,
  exitCode: null,
  exitSignal: null,
  startedAt: new Date().toISOString(),
};

let childProc = null;

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createNetServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function waitForPort(port, timeoutMs = 10000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (backendState.status === 'error') {
        reject(new Error(backendState.errorReason || 'Backend process exited during startup.'));
        return;
      }
      const req = httpRequest(
        {
          hostname: '127.0.0.1',
          port,
          path: '/api/brain/flavors',
          method: 'GET',
          timeout: 500,
        },
        (res) => {
          res.resume();
          resolve();
        }
      );
      req.on('error', () => {
        if (Date.now() - start >= timeoutMs) {
          reject(new Error(`Timed out after ${timeoutMs}ms waiting for agy-brain-viz on 127.0.0.1:${port}`));
        } else {
          setTimeout(check, 100);
        }
      });
      req.end();
    };
    check();
  });
}

async function startNativeBackend() {
  if (!existsSync(BINARY_PATH)) {
    backendState = {
      ...backendState,
      status: 'error',
      errorReason: `GraalVM native binary not found at ${BINARY_PATH}. Run './gradlew installPlugin' in the repository to compile and bundle the native executable.`,
    };
    console.error(`[sidecar] FAIL FAST: ${backendState.errorReason}`);
    return;
  }

  try {
    const port = await findFreePort();
    backendState.port = port;

    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(join(DATA_DIR, 'backend_port.txt'), String(port), 'utf8');
    writeFileSync(join(HERE, '.backend_port'), String(port), 'utf8');

    const args = [`-Dmicronaut.server.port=${port}`, `-Dmicronaut.server.host=127.0.0.1`];
    const env = {
      ...process.env,
      MICRONAUT_SERVER_PORT: String(port),
    };

    appendLog('INFO', `Spawning native binary: ${BINARY_PATH} ${args.join(' ')}`);
    childProc = spawn(BINARY_PATH, args, {
      cwd: HERE,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    backendState.pid = childProc.pid;

    childProc.stdout.on('data', (chunk) => appendLog('OUT', chunk));
    childProc.stderr.on('data', (chunk) => appendLog('ERR', chunk));

    childProc.on('error', (err) => {
      backendState = {
        ...backendState,
        status: 'error',
        errorReason: `Failed to spawn GraalVM native binary: ${err.message}`,
      };
      appendLog('ERR', backendState.errorReason);
    });

    childProc.on('exit', (code, signal) => {
      const wasReady = backendState.status === 'ready';
      backendState = {
        ...backendState,
        status: 'error',
        exitCode: code,
        exitSignal: signal,
        errorReason: `GraalVM native binary (PID ${backendState.pid}) exited unexpectedly with code=${code}, signal=${signal}.`,
      };
      appendLog('ERR', backendState.errorReason);
      if (wasReady && signal) {
        // If a running backend was terminated by a signal (e.g. plugin upgrade),
        // exit the sidecar wrapper so Antigravity's restartPolicy respawns cleanly.
        process.exit(1);
      }
    });

    await waitForPort(port, 12000);
    if (backendState.status !== 'error') {
      backendState.status = 'ready';
      appendLog('INFO', `Native backend ready on http://127.0.0.1:${port}`);
    }
  } catch (err) {
    backendState = {
      ...backendState,
      status: 'error',
      errorReason: err.message,
    };
    appendLog('ERR', `Startup failed: ${err.message}`);
  }
}

function cleanupChild() {
  if (childProc && !childProc.killed) {
    try {
      childProc.kill('SIGTERM');
    } catch (_) {}
  }
}

process.on('SIGTERM', () => {
  cleanupChild();
  process.exit(0);
});
process.on('SIGINT', () => {
  cleanupChild();
  process.exit(0);
});
process.on('exit', cleanupChild);

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderFailFastHtml() {
  const hasApiKey = Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim());
  const logsText = logBuffer.length > 0 ? logBuffer.join('\n') : '(No process output captured)';
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Brain Visualizer — Backend Error</title>
  <script src="/preload.js"></script>
  <style>
    body {
      margin: 0;
      padding: 24px;
      background: var(--background, #0f172a);
      color: var(--foreground, #f8fafc);
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 13px;
      line-height: 1.5;
    }
    .error-card {
      max-width: 760px;
      margin: 0 auto;
      background: var(--card, #1e293b);
      border: 2px solid #ef4444;
      border-radius: 12px;
      padding: 20px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.35);
    }
    .error-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 16px;
      font-weight: 700;
      color: #f87171;
      margin: 0 0 12px;
    }
    .reason-box {
      background: rgba(239, 68, 68, 0.12);
      border: 1px solid rgba(239, 68, 68, 0.35);
      border-radius: 8px;
      padding: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      color: var(--foreground, #f8fafc);
      margin-bottom: 16px;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: 6px 16px;
      font-size: 12px;
      margin-bottom: 16px;
    }
    .meta-label {
      color: var(--muted-foreground, #94a3b8);
      font-weight: 600;
    }
    .meta-val {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      word-break: break-all;
    }
    .log-pre {
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
      border-radius: 8px;
      padding: 12px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 11.5px;
      max-height: 260px;
      overflow-y: auto;
      white-space: pre-wrap;
      color: #e2e8f0;
    }
    .btn {
      margin-top: 14px;
      padding: 8px 16px;
      background: var(--primary, #3b82f6);
      color: var(--primary-foreground, #ffffff);
      border: none;
      border-radius: 6px;
      font-weight: 600;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <div class="error-card">
    <div class="error-title">🛑 Antigravity Brain Visualizer — Native Backend Failed</div>
    <div class="reason-box">${escapeHtml(backendState.errorReason || 'Native backend is not ready.')}</div>
    <div class="meta-grid">
      <div class="meta-label">Status:</div>
      <div class="meta-val">${escapeHtml(backendState.status)}</div>
      <div class="meta-label">Binary Path:</div>
      <div class="meta-val">${escapeHtml(backendState.binaryPath)}</div>
      <div class="meta-label">Internal Port:</div>
      <div class="meta-val">${escapeHtml(backendState.port ?? 'unassigned')}</div>
      <div class="meta-label">PID / Exit:</div>
      <div class="meta-val">PID=${escapeHtml(backendState.pid ?? 'none')}, code=${escapeHtml(backendState.exitCode ?? 'n/a')}, signal=${escapeHtml(backendState.exitSignal ?? 'n/a')}</div>
      <div class="meta-label">GEMINI_API_KEY:</div>
      <div class="meta-val">${hasApiKey ? '✓ Present in environment' : '⚠ NOT SET in environment'}</div>
      <div class="meta-label">Remediation:</div>
      <div class="meta-val">Run <code>./gradlew installPlugin</code> in the repository root, then disable and re-enable the plugin.</div>
    </div>
    <div style="font-weight:600; margin-bottom:6px;">Captured Process Output (stdout / stderr):</div>
    <pre class="log-pre">${escapeHtml(logsText)}</pre>
    <button class="btn" onclick="window.location.reload()">↻ Reload Panel</button>
  </div>
</body>
</html>`;
}

function isTokenValid(req, url) {
  if (!UI_TOKEN) return true;
  const provided = req.headers['x-sidecar-token'] || url.searchParams.get('token');
  return provided === UI_TOKEN;
}

const app = new SidecarApp();

app.api('/_sidecar/backend-status', () => ({
  ...backendState,
  geminiApiKeyConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim()),
  logs: logBuffer,
}), 'GET');

await startNativeBackend();

const server = await app.run();
const defaultSidecarListener = server.listeners('request')[0];
server.removeAllListeners('request');

server.on('request', (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');

  // Let SidecarApp handle /preload.js and /_sidecar/* natively
  if (url.pathname === '/preload.js' || url.pathname.startsWith('/_sidecar/')) {
    defaultSidecarListener(req, res);
    return;
  }

  // Enforce sidecar token on non-GET requests
  if (req.method !== 'GET' && !isTokenValid(req, url)) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized: missing or invalid X-Sidecar-Token' }));
    return;
  }

  // Fail fast and visibly if the GraalVM native binary is not running
  if (backendState.status !== 'ready' || !backendState.port) {
    if (url.pathname.startsWith('/api/')) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'NATIVE_BACKEND_UNAVAILABLE',
          summary: backendState.errorReason,
          backendState,
          logs: logBuffer,
        })
      );
      return;
    }
    res.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderFailFastHtml());
    return;
  }

  // Proxy request to the Micronaut GraalVM native server.
  // Strip 'origin' and 'referer' because Antigravity loads sidecar iframes under
  // 'plugin://<id>/', which Micronaut's host/origin validator would otherwise reject with 403.
  const forwardHeaders = {
    ...req.headers,
    host: `127.0.0.1:${backendState.port}`,
  };
  delete forwardHeaders.origin;
  delete forwardHeaders.referer;

  const proxyReq = httpRequest(
    {
      hostname: '127.0.0.1',
      port: backendState.port,
      path: req.url,
      method: req.method,
      headers: forwardHeaders,
    },
    (proxyRes) => {
      const respHeaders = {
        ...proxyRes.headers,
        'cache-control': 'no-store',
      };
      res.writeHead(proxyRes.statusCode || 200, respHeaders);
      proxyRes.pipe(res, { end: true });
    }
  );

  proxyReq.on('error', (err) => {
    appendLog('ERR', `Proxy error on ${req.method} ${req.url}: ${err.message}`);
    if (!res.headersSent) {
      if (url.pathname.startsWith('/api/')) {
        res.writeHead(502, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'PROXY_ERROR',
            message: err.message,
            backendState,
            logs: logBuffer,
          })
        );
      } else {
        res.writeHead(502, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderFailFastHtml());
      }
    } else {
      res.end();
    }
  });

  req.pipe(proxyReq, { end: true });
});
