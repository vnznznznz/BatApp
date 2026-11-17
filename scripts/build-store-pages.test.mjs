import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
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

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, 'build-store-pages.mjs');
const SOURCES = join(HERE, '..', 'docs', 'store');

const DETAILS = {
  OPERATOR_NAME: 'Test Operator',
  OPERATOR_ADDRESS_DE: 'Teststrasse 1, 0000 Testort, Schweiz',
  OPERATOR_ADDRESS_EN: 'Teststrasse 1, 0000 Testort, Switzerland',
  CONTACT_EMAIL: 'operator@example.test',
  EFFECTIVE_DATE: '2026-11-10',
  SITE_URL: 'https://example.test/night-courier/',
  LAUNCH_STATE: 'before-launch',
};

const build = (env, out, more = []) =>
  execFileSync(process.execPath, [SCRIPT, '--out', out, ...more], {
    env: { PATH: process.env.PATH ?? '', ...env },
    encoding: 'utf8',
    stdio: 'pipe',
  });

const read = (out, name) => readFileSync(join(out, 'night-courier', name), 'utf8');

let out;
let scratch;

beforeEach(() => {
  out = mkdtempSync(join(tmpdir(), 'store-pages-'));
  scratch = mkdtempSync(join(tmpdir(), 'store-sources-'));
});

afterEach(() => {
  rmSync(out, { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
});

/** A copy of the documents with one of them changed, to build from with --sources. */
function sourcesWith(file, change) {
  cpSync(SOURCES, scratch, { recursive: true });
  const before = readFileSync(join(scratch, file), 'utf8');
  const after = change(before);
  assert.notEqual(after, before, `the change to ${file} changed nothing`);
  writeFileSync(join(scratch, file), after);
  return scratch;
}

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

  // JavaScript turns 30 February into 2 March without a word. The date is the
  // binding policy's "Stand": it has to be the one that was typed, or nothing.
  it('are not built with a date that does not exist', () => {
    for (const date of ['2026-02-30', '2026-02-29', '2026-11-31', '2026-13-01', '2026-11-00']) {
      assert.throws(
        () => build({ ...DETAILS, EFFECTIVE_DATE: date }, out),
        /build-store-pages: EFFECTIVE_DATE is not a date that exists/,
        date,
      );
      assert.deepEqual(readdirSync(out), [], date);
    }
  });

  it('take the 29th of February in a leap year', () => {
    build({ ...DETAILS, EFFECTIVE_DATE: '2028-02-29' }, out);

    assert.match(read(out, 'privacy-policy.en.html'), /29 February 2028/);
    assert.match(read(out, 'privacy-policy.de.html'), /29\. Februar 2028/);
  });
});

describe('the help page', () => {
  it('marks its German half as German, from the heading to the end', () => {
    build({ ...DETAILS, LAUNCH_STATE: 'live' }, out);
    const html = read(out, 'index.html');

    assert.match(html, /<html lang="en">/);
    const german = html.match(/<hr>\n<div lang="de" id="[^"]+">\n([\s\S]*)<\/div>\n<\/main>/);
    assert.ok(german, 'no German half found');
    assert.match(german[1], /^<h1>Night Courier – Hilfe und Kontakt<\/h1>/);
    assert.match(german[1], /Websites\.<\/p>\s*$/);
    // Nothing German is left outside it, and nothing English got in.
    assert.doesNotMatch(html.slice(0, german.index), /Datenschutzerklärung|Fledermäusen/);
    assert.doesNotMatch(german[1], /carried by bats/);
  });

  it('leads to its German half from the top', () => {
    build(DETAILS, out);
    const html = read(out, 'index.html');

    const links = [...html.matchAll(/href="#([^"]+)"/g)].map((match) => match[1]);
    assert.deepEqual(links, ['night-courier--hilfe-und-kontakt']);
    assert.match(html, /<div lang="de" id="night-courier--hilfe-und-kontakt">/);
  });

  // The link is written by hand, from the German heading. Reword the heading
  // and it leads nowhere - which nobody would see until a reader tapped it.
  it('is not built when the link to the German half no longer matches its heading', () => {
    const sources = sourcesWith('support-page.md', (text) =>
      text.replace('# Night Courier – Hilfe und Kontakt', '# Night Courier – Hilfe'),
    );

    assert.throws(
      () => build(DETAILS, out, ['--sources', sources]),
      /index\.html links to #night-courier--hilfe-und-kontakt, which is nowhere on the page/,
    );
    assert.deepEqual(readdirSync(out), []);
  });

  it('is not built without the line that divides its two halves', () => {
    const sources = sourcesWith('support-page.md', (text) => text.replace('\n---\n', '\n'));

    assert.throws(() => build(DETAILS, out, ['--sources', sources]), /support-page\.md/);
    assert.deepEqual(readdirSync(out), []);
  });
});

/**
 * The pages went up before anyone could use the app, and the policy speaks in
 * the present tense: a project in Zurich, a signed processing agreement. Until
 * those exist, each page has to say that Night Courier has not started.
 */
describe('the launch notice', () => {
  const GERMAN = /Night Courier ist noch nicht gestartet\./;
  const ENGLISH = /Night Courier has not started yet\./;

  it('stands directly under the navigation of each policy, in its language', () => {
    build(DETAILS, out);

    assert.match(
      read(out, 'privacy-policy.de.html'),
      /<\/nav>\n<p class="notice" role="note"><strong>Night Courier ist noch nicht gestartet\.<\/strong> Diese Erklärung beschreibt, wie die App ab ihrem Start mit deinen Daten umgeht\. Bis dahin gibt es keine Konten, und die App verarbeitet keine personenbezogenen Daten\.<\/p>\n<h1>/,
    );
    assert.match(
      read(out, 'privacy-policy.en.html'),
      /<\/nav>\n<p class="notice" role="note"><strong>Night Courier has not started yet\.<\/strong> This policy describes how the app will handle your data from the day it starts\. Until then there are no accounts, and the app processes no personal data\.<\/p>\n<h1>/,
    );
    assert.doesNotMatch(read(out, 'privacy-policy.de.html'), ENGLISH);
    assert.doesNotMatch(read(out, 'privacy-policy.en.html'), GERMAN);
  });

  it('stands at the top of the help page, and at the top of its German half in German', () => {
    build(DETAILS, out);
    const html = read(out, 'index.html');

    assert.match(
      html,
      /<main>\n<p class="notice" role="note"><strong>Night Courier has not started yet\.<\/strong> What this page says about the app and your data holds from the day it starts\. Until then there are no accounts, and the app processes no personal data\.<\/p>\n<h1>Night Courier – help and contact<\/h1>/,
    );
    assert.match(
      html,
      /<div lang="de" id="night-courier--hilfe-und-kontakt">\n<p class="notice" role="note"><strong>Night Courier ist noch nicht gestartet\.<\/strong> Was diese Seite über die App und deine Daten sagt, gilt ab ihrem Start\. Bis dahin gibt es keine Konten, und die App verarbeitet keine personenbezogenen Daten\.<\/p>\n<h1>Night Courier – Hilfe und Kontakt<\/h1>/,
    );
    assert.equal(html.match(/class="notice"/g).length, 2);
  });

  it('is on no page once Night Courier is live', () => {
    build({ ...DETAILS, LAUNCH_STATE: 'live' }, out);

    for (const name of ['index.html', 'privacy-policy.de.html', 'privacy-policy.en.html']) {
      const html = read(out, name);
      assert.doesNotMatch(html, GERMAN, name);
      assert.doesNotMatch(html, ENGLISH, name);
      assert.doesNotMatch(html, /class="notice"|role="note"/, name);
    }
    // The pages are otherwise the same, heading straight after the navigation.
    assert.match(read(out, 'privacy-policy.de.html'), /<\/nav>\n<h1>Datenschutzerklärung/);
    assert.match(read(out, 'index.html'), /<main>\n<h1>Night Courier – help and contact<\/h1>/);
  });

  // No default: a rebuild after an edit must not switch the notice off - or on
  // again - because somebody left the setting out.
  it('has to be decided each time the pages are built', () => {
    const rest = { ...DETAILS };
    delete rest.LAUNCH_STATE;
    assert.throws(() => build(rest, out), /LAUNCH_STATE/);
    assert.deepEqual(readdirSync(out), []);

    for (const state of ['launched', 'LIVE', 'before launch']) {
      assert.throws(
        () => build({ ...DETAILS, LAUNCH_STATE: state }, out),
        /build-store-pages: LAUNCH_STATE must be before-launch or live/,
        state,
      );
      assert.deepEqual(readdirSync(out), [], state);
    }
  });

  it('is named in what the build prints, so that a wrong state is seen before it is pushed', () => {
    assert.match(build(DETAILS, out), /not started yet: every page carries the notice/);
    assert.match(build({ ...DETAILS, LAUNCH_STATE: 'live' }, out), /live: no notice/);
  });
});
