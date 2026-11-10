import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/**
 * The public web pages are built from docs/store/ by build-store-pages.mjs. An
 * edit to those documents - a new placeholder, an image, a link to a font -
 * would otherwise only show when the operator next rebuilds, on the live
 * privacy policy. This builds them with made-up details on every test run.
 */

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'build-store-pages.mjs');

const DETAILS = {
  OPERATOR_NAME: 'Test Operator',
  OPERATOR_ADDRESS_DE: 'Teststrasse 1, 0000 Testort, Schweiz',
  OPERATOR_ADDRESS_EN: 'Teststrasse 1, 0000 Testort, Switzerland',
  CONTACT_EMAIL: 'operator@example.test',
  EFFECTIVE_DATE: '2026-11-10',
  SITE_URL: 'https://example.test/night-courier/',
};

const build = (env, out) =>
  execFileSync(process.execPath, [SCRIPT, '--out', out], {
    env: { PATH: process.env.PATH ?? '', ...env },
    encoding: 'utf8',
    stdio: 'pipe',
  });

const read = (out, name) => readFileSync(join(out, 'night-courier', name), 'utf8');

let out;

beforeEach(() => {
  out = mkdtempSync(join(tmpdir(), 'store-pages-'));
});

afterEach(() => {
  rmSync(out, { recursive: true, force: true });
});

describe('the public web pages', () => {
  it('build from the documents, with every detail filled in and nothing left over', () => {
    build(DETAILS, out);

    const pages = readdirSync(join(out, 'night-courier')).sort();
    assert.deepEqual(pages, ['index.html', 'privacy-policy.de.html', 'privacy-policy.en.html']);
    for (const name of pages) {
      const html = read(out, name);
      assert.match(html, /Test Operator/, name);
      assert.match(html, /mailto:operator@example\.test/, name);
      assert.doesNotMatch(html, /\{\{|<!--|PRÜFEN|TO CHECK/, name);
      // Nothing from another site: the privacy policy promises it.
      assert.doesNotMatch(html, /<script|<link\b|<img|\ssrc=|@import|url\(/i, name);
    }
    assert.match(read(out, 'privacy-policy.de.html'), /Teststrasse 1, 0000 Testort, Schweiz/);
    assert.match(read(out, 'privacy-policy.de.html'), /10\. November 2026/);
    assert.match(read(out, 'privacy-policy.en.html'), /10 November 2026/);
    assert.ok(readdirSync(out).includes('.nojekyll'));
    assert.ok(readdirSync(out).includes('index.html'));
  });

  it('are not built at all while a detail is missing', () => {
    const rest = { ...DETAILS };
    delete rest.OPERATOR_NAME;

    assert.throws(() => build(rest, out), /OPERATOR_NAME/);
    assert.deepEqual(readdirSync(out), []);
  });
});
