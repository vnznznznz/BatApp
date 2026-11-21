import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { definesFunction } from './migrations.mjs';

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

/**
 * The same details once Night Courier has started. A live build also has to be
 * told when the processing agreement was signed: the policy says there is one.
 */
const LIVE = { ...DETAILS, LAUNCH_STATE: 'live', DPA_SIGNED: '2026-11-05' };

/**
 * The functions the pages rest on, each as a migration would create it. The
 * build is refused without them, and whether this tree has them all is not
 * what the tests below are about: they build against a folder that does.
 */
const RESTS_ON = [
  'public.delete_own_account',
  'private.delete_account',
  'private.remove_account',
  'private.tidy_up',
  'private.forget_old_reports',
];

const build = (env, out, more = []) =>
  execFileSync(
    process.execPath,
    [
      SCRIPT,
      '--out',
      out,
      ...(more.includes('--migrations') ? [] : ['--migrations', migrations]),
      ...more,
    ],
    { env: { PATH: process.env.PATH ?? '', ...env }, encoding: 'utf8', stdio: 'pipe' },
  );

const read = (out, name) => readFileSync(join(out, 'night-courier', name), 'utf8');

/** The date it is, or will be, in UTC that many hours from now, as YYYY-MM-DD. */
const dayIn = (hours) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString().slice(0, 10);

let out;
let scratch;
let migrations;

/** A folder of migrations that creates these functions, and nothing else. */
function migrationsWith(functions) {
  const folder = mkdtempSync(join(tmpdir(), 'store-migrations-'));
  writeFileSync(
    join(folder, '20260101000000_stand_in.sql'),
    functions.map((name) => `create or replace function ${name}()\nreturns void;\n`).join('\n'),
  );
  return folder;
}

beforeEach(() => {
  out = mkdtempSync(join(tmpdir(), 'store-pages-'));
  scratch = mkdtempSync(join(tmpdir(), 'store-sources-'));
  migrations = migrationsWith(RESTS_ON);
});

afterEach(() => {
  rmSync(out, { recursive: true, force: true });
  rmSync(scratch, { recursive: true, force: true });
  rmSync(migrations, { recursive: true, force: true });
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
    build({ ...DETAILS, EFFECTIVE_DATE: '2024-02-29' }, out);

    assert.match(read(out, 'privacy-policy.en.html'), /29 February 2024/);
    assert.match(read(out, 'privacy-policy.de.html'), /29\. Februar 2024/);
  });

  // The date is the policy's "Stand": the day this version of it is from. A
  // year mistyped, 2027 for 2026, went through and was published as typed
  // (found in review); the page is always the current version, so its date
  // cannot be one that has not come.
  it('are not built with a date that is still to come', () => {
    for (const details of [DETAILS, LIVE])
      for (const date of ['2999-01-01', dayIn(14 + 48)]) {
        assert.throws(
          () => build({ ...details, EFFECTIVE_DATE: date }, out),
          new RegExp(`build-store-pages: EFFECTIVE_DATE \\(${date}\\) is in the future`),
          `${details.LAUNCH_STATE} ${date}`,
        );
        assert.deepEqual(readdirSync(out), [], `${details.LAUNCH_STATE} ${date}`);
      }
  });

  // Whoever builds in the evening in Zurich is a day ahead of a machine that
  // keeps UTC, and is right about the date all the same.
  it('take today’s date, and that of a day that has begun anywhere', () => {
    for (const date of [dayIn(0), dayIn(14)]) {
      build({ ...DETAILS, EFFECTIVE_DATE: date }, out);
      build({ ...LIVE, EFFECTIVE_DATE: date }, out);
    }
  });
});

/**
 * The pages carry the operator's name, address and email, and this repository
 * is public. "--out ." - the site's checkout mistyped - wrote them into it,
 * untracked, one `git add -A` from being published with the code.
 */
describe('where the pages are built', () => {
  const REPOSITORY = join(HERE, '..');
  /**
   * Every build that is to be refused below lacks a detail as well: were the
   * check gone, it would stop at that rather than write the pages into this
   * repository, and still fail the test by its reason.
   */
  const NO_NAME = { ...DETAILS };
  delete NO_NAME.OPERATOR_NAME;

  /** The build run from `cwd`, as an operator would run it there. */
  const buildFrom = (cwd, env, out) =>
    execFileSync(process.execPath, [SCRIPT, '--out', out, '--migrations', migrations], {
      cwd,
      env: { PATH: process.env.PATH ?? '', ...env },
      encoding: 'utf8',
      stdio: 'pipe',
    });

  const INSIDE = /build-store-pages: --out .+ is inside this repository, which is public/;

  for (const [where, out] of [
    ['this repository, as "."', '.'],
    ['this repository, by its whole path', REPOSITORY],
    ['a folder inside it', 'docs/store'],
    ['a folder still to be made inside it', join('site', 'night-courier')],
  ]) {
    it(`is never ${where}`, () => {
      assert.throws(() => buildFrom(REPOSITORY, NO_NAME, out), INSIDE);
    });
  }

  it('is never inside this repository by way of a link to it', () => {
    symlinkSync(REPOSITORY, join(scratch, 'link'));

    assert.throws(() => buildFrom(scratch, NO_NAME, join('link', 'site')), INSIDE);
  });

  it('may be a folder beside this repository whose name begins as its own does', () => {
    assert.throws(() => buildFrom(REPOSITORY, NO_NAME, `${REPOSITORY}-site`), /set OPERATOR_NAME/);
  });

  it('may be anywhere outside it', () => {
    buildFrom(REPOSITORY, DETAILS, out);

    assert.deepEqual(readdirSync(join(out, 'night-courier')).length, 3);
  });
});

describe('the help page', () => {
  it('marks its German half as German, from the heading to the end', () => {
    build(LIVE, out);
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
 * The privacy policy promises that the pages load nothing from other sites.
 * The build looked for scripts, style sheets, frames, images and src= alone,
 * and let through an embedded document, an SVG image, a video's poster and
 * the other ways a page fetches something as it is shown.
 */
describe('what the pages load', () => {
  const HEADING = '# Night Courier – help and contact\n';

  /** The help page's source, with `html` under its first heading. */
  const sourcesWithHtml = (html) =>
    sourcesWith('support-page.md', (text) => text.replace(HEADING, `${HEADING}\n${html}\n`));

  for (const [what, html, said] of [
    [
      'an embedded document, by <object data>',
      '<object data="https://example.org/a.pdf"></object>',
      '<object>',
    ],
    ['an embed', '<embed src="https://example.org/a.svg">', '<embed>'],
    [
      'an SVG image, by its href',
      '<svg><image href="https://example.org/a.png" width="8" height="8"/></svg>',
      'href= on <image>',
    ],
    [
      'an SVG image, by its xlink:href',
      '<svg><image xlink:href="https://example.org/a.png"/></svg>',
      'xlink:href= on <image>',
    ],
    [
      'a picture, by its srcset',
      '<picture><source srcset="https://example.org/a.webp 1x"></picture>',
      'srcset= on <source>',
    ],
    [
      'a video’s poster',
      '<video poster="https://example.org/a.jpg"></video>',
      'poster= on <video>',
    ],
    [
      'a table’s background',
      '<table background="https://example.org/a.png"><tr><td>x</td></tr></table>',
      'background= on <table>',
    ],
    [
      'a link that pings another site when it is followed',
      '<a href="index.html" ping="https://example.org/count">Help</a>',
      'ping= on <a>',
    ],
    [
      'an image behind a quoted >, which ends no tag',
      '<svg><image title="1 > 0" href="https://example.org/a.png"/></svg>',
      'href= on <image>',
    ],
    [
      'a script run by an attribute',
      '<svg onload="fetch(\'https://example.org/\')"></svg>',
      'onload= on <svg>',
    ],
    [
      'a script run by a link',
      '<a href="javascript:fetch(\'https://example.org/\')">Help</a>',
      'a javascript: link',
    ],
    [
      'another page, by a refresh',
      '<meta http-equiv="refresh" content="0; url=https://example.org/">',
      'http-equiv=refresh on <meta>',
    ],
    [
      'an image set in a style',
      '<p style="background-image: image-set(\'https://example.org/a.png\' 1x)">x</p>',
      'image-set(',
    ],
  ]) {
    it(`are not built with ${what}`, () => {
      const sources = sourcesWithHtml(html);

      assert.throws(
        () => build(DETAILS, out, ['--sources', sources]),
        (error) =>
          error.stderr.includes(
            `index.html would load something from elsewhere (${said}); the privacy policy ` +
              'promises it does not',
          ),
      );
      assert.deepEqual(readdirSync(out), []);
    });
  }

  /** A link loads nothing until it is followed, and the pages lead to each other with links. */
  it('are built with plain links, to each other and to other sites', () => {
    const sources = sourcesWithHtml(
      '<p><a href="privacy-policy.en.html" title="1 > 0">The policy</a>, ' +
        '<a href="https://example.org/">a site</a>, ' +
        '<a href="#night-courier--hilfe-und-kontakt">Deutsch</a>, ' +
        '<a href="mailto:operator@example.test">mail</a>.</p>',
    );

    build(DETAILS, out, ['--sources', sources]);

    assert.match(read(out, 'index.html'), /<a href="https:\/\/example\.org\/">a site<\/a>/);
  });
});

/**
 * Google is given the account deletion text in docs/store/google-play.md and
 * checks the help page against it. What is kept, and for how long, is the part
 * that changes - a new period, another way an account is deleted - and it is
 * written out twice, in two languages. Changed in one place only, the two say
 * different things to the same reader.
 */
describe('what is kept after an account is deleted', () => {
  const plain = (text) => text.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

  /** The list under a heading of the help page, one entry per item. */
  function onTheHelpPage(heading) {
    const page = readFileSync(join(SOURCES, 'support-page.md'), 'utf8');
    const list = page.split(`**${heading}:**\n\n`)[1]?.split('\n\n')[0];
    assert.ok(list, `the help page has no list under "${heading}"`);
    return list.split(/^- /m).slice(1).map(plain);
  }

  /** The same list in the text for Google Play, which is plain text with bullets. */
  function forGooglePlay(title, heading) {
    const document = readFileSync(join(SOURCES, 'google-play.md'), 'utf8');
    const text = document.split(`\`\`\`text\n${title}\n`)[1]?.split('```')[0];
    assert.ok(text, `google-play.md has no text that starts "${title}"`);
    const list = text.split(`\n${heading}\n`)[1]?.split('\n\n')[0];
    assert.ok(list, `the text "${title}" has no list under "${heading}"`);
    return list.split(/^• /m).slice(1).map(plain);
  }

  it('reads the same on the help page and in the text for Google Play, in English', () => {
    const page = onTheHelpPage('What is kept, and for how long');
    assert.equal(page.length, 6);
    assert.deepEqual(
      forGooglePlay('Deleting your Night Courier account', 'What is kept, and for how long'),
      page,
    );
  });

  it('reads the same on the help page and in the text for Google Play, in German', () => {
    const page = onTheHelpPage('Was bleibt, und wie lange');
    assert.equal(page.length, 6);
    assert.deepEqual(
      forGooglePlay('Dein Night-Courier-Konto löschen', 'Was bleibt, und wie lange'),
      page,
    );
  });

  // The policy names no period for these yet. A pointer to it for "how long"
  // sends the reader to a page that does not say (found in review).
  it('does not send the reader to the privacy policy for a period the policy does not give', () => {
    const policies = ['privacy-policy.en.md', 'privacy-policy.de.md'].map((file) =>
      readFileSync(join(SOURCES, file), 'utf8'),
    );
    const unknown = policies.some((text) => /a short time|nach kurzer Zeit/.test(text));
    const pointers = [
      ...onTheHelpPage('What is kept, and for how long'),
      ...onTheHelpPage('Was bleibt, und wie lange'),
    ].filter((item) => /says how long|Wie lange, steht in der Datenschutzerklärung/.test(item));

    if (unknown) assert.deepEqual(pointers, []);
  });

  // The same in the page's last section, which sends the reader to the policy
  // for everything: "what, why, and for how long" was said flatly there, a few
  // lines below the admission that two periods are not known (found in review).
  it('does not say flatly that the policy gives every period while it does not', () => {
    const page = readFileSync(join(SOURCES, 'support-page.md'), 'utf8');
    /** The first paragraph under a heading, as one line. */
    const section = (heading) =>
      plain(page.split(`\n## ${heading}\n\n`)[1]?.split('\n\n')[0] ?? '');
    const english = section('Privacy');
    const german = section('Datenschutz');
    assert.match(english, /^The privacy policy says what Night Courier stores/);
    assert.match(german, /^Was Night Courier speichert/);

    const unknown = ['privacy-policy.en.md', 'privacy-policy.de.md']
      .map((file) => readFileSync(join(SOURCES, file), 'utf8'))
      .some((text) => /a short time|nach kurzer Zeit/.test(text));
    if (unknown) {
      assert.match(english, /as far as it is known today – for how long:/);
      assert.match(
        german,
        /soweit es heute feststeht – wie lange, steht in der Datenschutzerklärung:/,
      );
    }
  });
});

/**
 * The pages promise what the database does: that an account deleted on request
 * loses its sign-in records at once, that a report is gone after 180 days.
 * Each of those is a function in a migration, and documents and migrations are
 * written on different branches. The pages were once about to be rebuilt from
 * a tree that had the sentence and not yet the function (found in review).
 */
describe('what the pages promise of the database', () => {
  it('is not published from a tree that lacks a function it rests on', () => {
    for (const missing of RESTS_ON) {
      const folder = migrationsWith(RESTS_ON.filter((name) => name !== missing));
      try {
        assert.throws(
          () => build(DETAILS, out, ['--migrations', folder]),
          new RegExp(
            `build-store-pages: the pages say .+ That is ${missing.replace('.', '\\.')}, ` +
              'and no migration in .+ creates it',
          ),
          missing,
        );
        assert.deepEqual(readdirSync(out), [], missing);
      } finally {
        rmSync(folder, { recursive: true, force: true });
      }
    }
  });

  it('is not taken on trust from a migration that only mentions the function', () => {
    const folder = migrationsWith(RESTS_ON.filter((name) => name !== 'private.delete_account'));
    writeFileSync(
      join(folder, '20260102000000_mention.sql'),
      '-- private.delete_account comes later\n' +
        'revoke all on function private.delete_account(uuid) from public;\n',
    );
    try {
      assert.throws(
        () => build(DETAILS, out, ['--migrations', folder]),
        /That is private\.delete_account, and no migration in .+ creates it/,
      );
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  // Left to itself the build asks this repository's own migrations. Whether
  // they have every function depends on which branches are in the tree, so the
  // test asks the same question first and expects the matching answer.
  it('is checked against this repository’s own migrations unless told otherwise', () => {
    const missing = RESTS_ON.filter((name) => !definesFunction(name));
    const fromThisTree = () =>
      execFileSync(process.execPath, [SCRIPT, '--out', out], {
        env: { PATH: process.env.PATH ?? '', ...DETAILS },
        encoding: 'utf8',
        stdio: 'pipe',
      });

    if (missing.length === 0) {
      assert.match(fromThisTree(), /Built 4 pages/);
    } else {
      assert.throws(
        fromThisTree,
        new RegExp(`That is ${missing[0].replace('.', '\\.')}, and no migration in .+ creates it`),
      );
      assert.deepEqual(readdirSync(out), []);
    }
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
    build(LIVE, out);

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

  // The site repository's README carried the build command from before the
  // setting existed. Whoever runs that command has to learn from the refusal
  // itself what to add, and which of the two values is the safe one.
  it('tells whoever left the setting out which state to give', () => {
    const rest = { ...DETAILS };
    delete rest.LAUNCH_STATE;

    assert.throws(
      () => build(rest, out),
      /build-store-pages: set LAUNCH_STATE \(see the comment at the top of this file\)\. LAUNCH_STATE=before-launch until Night Courier has started; docs\/GO-LIVE\.md, "Where the web pages live", says when it is live/,
    );
  });

  it('is named in what the build prints, so that a wrong state is seen before it is pushed', () => {
    assert.match(build(DETAILS, out), /not started yet: every page carries the notice/);
    assert.match(build(LIVE, out), /live: no notice/);
  });
});

/**
 * Without the notice the policy stands as written: Supabase processes the data
 * "on the basis of a data processing agreement", and a reader may ask for a
 * copy of its clauses. The pages once went up before that agreement existed,
 * and only a sentence in a runbook stood in the way. So a live build asks for
 * the date the agreement was signed - the one docs/store/gdpr-records.md, 5.1,
 * has a blank for - and whoever cannot give it has their answer.
 */
describe('a live build', () => {
  it('is refused without the date the processing agreement was signed', () => {
    const rest = { ...LIVE };
    delete rest.DPA_SIGNED;

    assert.throws(
      () => build(rest, out),
      /build-store-pages: LAUNCH_STATE=live needs DPA_SIGNED, the date the processing agreement with Supabase was signed/,
    );
    assert.deepEqual(readdirSync(out), []);
  });

  it('is refused with a date that is not one, or that does not exist', () => {
    for (const date of [
      'yes',
      'signed',
      '5 November 2026',
      '2026-11-5',
      '2026-02-30',
      '2026-13-01',
    ]) {
      assert.throws(
        () => build({ ...LIVE, DPA_SIGNED: date }, out),
        /build-store-pages: DPA_SIGNED must be a date that exists, as YYYY-MM-DD/,
        date,
      );
      assert.deepEqual(readdirSync(out), [], date);
    }
  });

  // A policy dated before the agreement it says exists was untrue on its date.
  it('is refused when the agreement was signed after the date the policy carries', () => {
    assert.throws(
      () => build({ ...LIVE, EFFECTIVE_DATE: '2026-11-10', DPA_SIGNED: '2026-11-11' }, out),
      /build-store-pages: DPA_SIGNED \(2026-11-11\) is later than EFFECTIVE_DATE \(2026-11-10\)/,
    );
    assert.deepEqual(readdirSync(out), []);
  });

  it('is refused when the agreement is still to be signed', () => {
    for (const date of ['2999-01-01', dayIn(14 + 48)]) {
      assert.throws(
        () => build({ ...LIVE, DPA_SIGNED: date }, out),
        new RegExp(`build-store-pages: DPA_SIGNED \\(${date}\\) is in the future`),
        date,
      );
      assert.deepEqual(readdirSync(out), [], date);
    }
  });

  it('takes the day the policy is dated, and says in what it prints when the agreement was signed', () => {
    const printed = build({ ...LIVE, EFFECTIVE_DATE: '2026-11-10', DPA_SIGNED: '2026-11-10' }, out);

    assert.match(printed, /live: no notice \(processing agreement signed 10 November 2026\)/);
    // The date is the build's to check, not the page's to show.
    for (const name of ['index.html', 'privacy-policy.de.html', 'privacy-policy.en.html'])
      assert.doesNotMatch(read(out, name), /DPA_SIGNED/, name);
  });

  it('is the only build that needs it: before the launch, the notice says what is true', () => {
    assert.match(build(DETAILS, out), /not started yet: every page carries the notice/);
  });
});
