#!/usr/bin/env node

function sanitize(msg) {
  return String(msg || '')
    .replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, 'Bearer [REDACTED]')
    .replace(/sk-[A-Za-z0-9_\-]{16,}/g, '[REDACTED_API_KEY]');
}

// Prevent uncaught exceptions from leaking stack traces and source file paths
process.on('uncaughtException', (err) => {
  const message = err && err.message ? err.message : String(err);
  console.error(`[ERROR] ${sanitize(message)}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  const message = reason && reason.message ? reason.message : String(reason);
  console.error(`[ERROR] ${sanitize(message)}`);
  process.exit(1);
});

const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const targetCli = path.resolve(__dirname, '../../chatterbox/dist/cli/index.js');

if (!fs.existsSync(targetCli)) {
  console.error('[ERROR] Chatterbox CLI build not found. Please run "pnpm run build" in chatterbox.');
  process.exit(1);
}

import(pathToFileURL(targetCli).href).catch((err) => {
  const message = err && err.message ? err.message : String(err);
  console.error(`[ERROR] ${sanitize(message)}`);
  process.exit(1);
});

