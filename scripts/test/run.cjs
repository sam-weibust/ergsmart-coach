/**
 * Runner for the headless force-curve tests.
 *
 *   node scripts/test/run.cjs        (or: npm run test:force-curve)
 *
 * Transpiles the real src/ TypeScript + TSX on the fly with sucrase, using the
 * automatic JSX runtime so component files that don't `import React` (Vite's
 * default) work under plain Node.
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
addHook('.tsx', {
  transforms: ['imports', 'typescript', 'jsx'],
  jsxRuntime: 'automatic',
  production: true,
});

require('./force-curve.ts');
