'use strict';
const js = require('@eslint/js');
const globals = require('globals');

// The app is plain browser scripts that share one `CPT` global (no bundler, no
// modules) so it keeps working when index.html is opened straight from disk.
module.exports = [
  { ignores: ['node_modules/**', '_site/**'] },
  js.configs.recommended,
  {
    files: ['js/**/*.js', 'profiles/**/*.js', 'config.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser, CPT: 'writable' } },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }], 'no-var': 'error', 'prefer-const': 'warn', eqeqeq: ['warn', 'always', { null: 'ignore' }] },
  },
  {
    files: ['sw.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.serviceworker } },
  },
  {
    files: ['tests/**/*.js', 'scripts/**/*.js', 'eslint.config.js'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { 'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }] },
  },
  {
    // page.evaluate() callbacks in the e2e run inside the browser.
    files: ['tests/e2e.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
];
