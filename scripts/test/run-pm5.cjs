/**
 * Runner for the headless PM5 parsing / display-format tests.
 *
 *   node scripts/test/run-pm5.cjs        (or: npm run test:pm5)
 *
 * Same sucrase-on-the-fly setup as run.cjs — transpiles the real src/
 * TypeScript so the tests exercise shipping code, not a copy of it.
 */
const path = require('path');
const Module = require('module');
const { addHook } = require('sucrase/dist/register');

// Mirror Vite's "@/" → "src/" alias (vite.config.ts / tsconfig paths).
const SRC = path.resolve(__dirname, '../../src');
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  const mapped = request.startsWith('@/') ? path.join(SRC, request.slice(2)) : request;
  return resolveFilename.call(this, mapped, ...rest);
};

addHook('.ts', { transforms: ['imports', 'typescript'] });

require('./pm5-parse.ts');
