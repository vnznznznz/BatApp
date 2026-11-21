/**
 * Builds Night Courier's public web pages - the help page and the privacy
 * policy - from the Markdown in docs/store/, ready for GitHub Pages.
 *
 * The sources carry placeholders for the operator's name, address and email,
 * because this repository is public and those details belong only on the
 * published pages. They come in through the environment, so they never touch a
 * file here:
 *
 *   OPERATOR_NAME='…' OPERATOR_ADDRESS_DE='…' OPERATOR_ADDRESS_EN='…' \
 *   CONTACT_EMAIL='…' EFFECTIVE_DATE=2026-11-10 LAUNCH_STATE=before-launch \
 *   SITE_URL=https://vnznznznz.github.io/night-courier/ \
 *   npm run build:pages -- --out ../vnznznznz.github.io
 *
 * LAUNCH_STATE says whether Night Courier has started. The policy speaks in
 * the present tense - a database in Zurich, a signed processing agreement -
 * and the pages are public before any of that exists. With before-launch,
 * every page says at its top that the app has not started and that nothing is
 * processed yet; with live, the pages stand as written. There is no default:
 * docs/GO-LIVE.md, "Where the web pages live", says when live becomes true.
 *
 * A live build also needs DPA_SIGNED=YYYY-MM-DD, the date the processing
 * agreement with Supabase was signed, as it is written into
 * docs/store/gdpr-records.md, 5.1. The pages do not show it. It is asked for
 * because the policy says the agreement exists, and the pages have once been
 * published before it did: whoever cannot give the date is not ready to build
 * as live.
 *
 * --out is the site repository's checkout. The pages go into its folder
 * night-courier/ (index.html is the help page), with a redirect at its root and
 * a .nojekyll, so that GitHub serves the files as they are: no theme, nothing
 * loaded from anywhere else. Then commit and push there. docs/GO-LIVE.md,
 * "The web pages", has the whole procedure.
 *
 * Refuses to build into this repository, which is public, by any path; and
 * when a value is missing, a date does not exist or is still to come, a live
 * build has no date for the agreement, a placeholder is left over, a link
 * within a page leads nowhere, a page would load anything from another site -
 * the privacy policy promises it does not - or this tree's migrations lack a
 * function that a promise on the pages rests on.
 *
 * --sources <folder> builds from another folder than docs/store/, and
 * --migrations <folder> looks for the functions in another folder than
 * supabase/migrations/. The tests use them to show what a careless edit to a
 * document, or a tree without a migration, would do.
 */

import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { marked } from 'marked';

import { definesFunction, MIGRATIONS as OWN_MIGRATIONS } from './migrations.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const REQUIRED = [
  'OPERATOR_NAME',
  'OPERATOR_ADDRESS_DE',
  'OPERATOR_ADDRESS_EN',
  'CONTACT_EMAIL',
  'EFFECTIVE_DATE',
  'SITE_URL',
  'LAUNCH_STATE',
];

function fail(message) {
  console.error(`build-store-pages: ${message}`);
  process.exit(1);
}

const option = (name) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
};

const outArg = option('--out');
if (!outArg) fail('pass --out <the site repository checkout>');
const OUT = resolve(outArg);

/**
 * The folder `path` names as the file system has it: through every link, as
 * far as the folders exist, and the rest as written.
 */
function realFolder(path) {
  const rest = [];
  let existing = resolve(path);
  while (!existsSync(existing)) {
    rest.unshift(basename(existing));
    existing = dirname(existing);
  }
  return join(realpathSync.native(existing), ...rest);
}

// The pages carry the operator's name, address and email, and this repository
// is public: built anywhere inside it - "--out ." for the site's checkout,
// mistyped - they are one `git add -A` from being published with the code.
// Asked before anything else, so that nothing is written there. A folder
// beside it whose name begins as its own does is outside it.
const fromRoot = relative(realFolder(ROOT), realFolder(OUT));
if (!(fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)))
  fail(
    `--out ${outArg} is inside this repository, which is public, and the pages carry the ` +
      "operator's details. Pass the checkout of the site repository, outside this one",
  );
const SOURCES = resolve(option('--sources') ?? join(ROOT, 'docs', 'store'));
const MIGRATIONS = resolve(option('--migrations') ?? OWN_MIGRATIONS);

const missing = REQUIRED.filter((name) => !process.env[name]?.trim());
if (missing.length)
  fail(
    `set ${missing.join(', ')} (see the comment at the top of this file)` +
      // The one value that is a decision, and that older copies of the build
      // command do not have: say which answer is the safe one.
      (missing.includes('LAUNCH_STATE')
        ? '. LAUNCH_STATE=before-launch until Night Courier has started; docs/GO-LIVE.md, ' +
          '"Where the web pages live", says when it is live'
        : ''),
  );

const env = Object.fromEntries(REQUIRED.map((name) => [name, process.env[name].trim()]));
if (!/^https:\/\/.+\/$/.test(env.SITE_URL)) fail('SITE_URL must be an https URL ending in /');
if (!/^\d{4}-\d{2}-\d{2}$/.test(env.EFFECTIVE_DATE)) fail('EFFECTIVE_DATE must be YYYY-MM-DD');
if (!['before-launch', 'live'].includes(env.LAUNCH_STATE))
  fail('LAUNCH_STATE must be before-launch or live');

/**
 * The day a YYYY-MM-DD names, at noon UTC, or null when there is no such day.
 *
 * JavaScript rolls a day the month does not have into the next month: 30
 * February becomes 2 March, and the binding policy would carry a date nobody
 * typed. So the date has to come back out as it went in. (An impossible month
 * gives no date at all, and toISOString would throw on it: hence the first test.)
 */
function dayOf(text) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const day = new Date(`${text}T12:00:00Z`);
  return Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== text ? null : day;
}

const date = dayOf(env.EFFECTIVE_DATE);
if (!date) fail('EFFECTIVE_DATE is not a date that exists');

/**
 * Whether a YYYY-MM-DD names a day that has not begun anywhere yet.
 *
 * Clocks run up to fourteen hours ahead of UTC, so the latest day there is, at
 * any moment, is the date fourteen hours from now. Whoever builds in the
 * evening in Zurich is a day ahead of a machine that keeps UTC, and right.
 */
const stillToCome = (text) =>
  text > new Date(Date.now() + 14 * 60 * 60 * 1000).toISOString().slice(0, 10);

// The date is the policy's "Stand": the day this version of it is from. The
// page is always the current version (its section 15), so a date ahead of
// today is a slip of the hand - 2027 for 2026 - and would be published as
// typed. A change announced in advance goes up on the day it takes effect.
if (stillToCome(env.EFFECTIVE_DATE))
  fail(
    `EFFECTIVE_DATE (${env.EFFECTIVE_DATE}) is in the future. It is the day this version of ` +
      'the policy is from: today, if the policy has just changed',
  );
const longDate = (locale, day = date) =>
  new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(day);

// Live means the policy stands as written, and it says that Supabase works
// under a signed processing agreement. So a live build has to be told when it
// was signed: not on a day still to come, and not later than the date the
// policy itself carries.
let agreementSigned = null;
if (env.LAUNCH_STATE === 'live') {
  const given = process.env.DPA_SIGNED?.trim();
  if (!given)
    fail(
      'LAUNCH_STATE=live needs DPA_SIGNED, the date the processing agreement with Supabase was ' +
        'signed (docs/store/gdpr-records.md, 5.1). Without one, build with LAUNCH_STATE=before-launch',
    );
  agreementSigned = dayOf(given);
  if (!agreementSigned) fail('DPA_SIGNED must be a date that exists, as YYYY-MM-DD');
  if (stillToCome(given)) fail(`DPA_SIGNED (${given}) is in the future`);
  if (agreementSigned > date)
    fail(`DPA_SIGNED (${given}) is later than EFFECTIVE_DATE (${env.EFFECTIVE_DATE})`);
}

/**
 * What the pages promise of the database, each with the function that keeps
 * the promise. Documents and migrations are written on different branches, and
 * the pages are built by hand, whenever someone decides to: without this, a
 * tree that has the sentence and not yet the function publishes the sentence.
 * (The tests of the functions themselves are the database tests; this only
 * asks that they are there.)
 */
const RESTS_ON = [
  ['deleting your account in the app deletes it for good', 'public.delete_own_account'],
  ['an account deleted on request loses its sign-in records at once', 'private.delete_account'],
  ['an account removed for breaking the rules is banned for two years', 'private.remove_account'],
  ['a daily job deletes what has reached the end of its period', 'private.tidy_up'],
  ['a report is deleted 180 days after it was made', 'private.forget_old_reports'],
];

for (const [promise, name] of RESTS_ON) {
  if (!definesFunction(name, MIGRATIONS))
    fail(
      `the pages say that ${promise}. That is ${name}, and no migration in ${MIGRATIONS} ` +
        'creates it: the branch that adds it has to be in this tree before the pages are built',
    );
}

const link = (url) => `[${url}](${url})`;
const email = `[${env.CONTACT_EMAIL}](mailto:${env.CONTACT_EMAIL})`;

/** Replaces every {{PLACEHOLDER}}; one without a value stops the build. */
function fill(markdown, values, page) {
  const filled = markdown.replace(/\{\{([A-Z_]+)\}\}/g, (all, key) => {
    if (!(key in values)) fail(`${page}: no value for ${all}`);
    return values[key];
  });
  // "[{{CONTACT_EMAIL}}](mailto:{{CONTACT_EMAIL}})" in a source would otherwise nest two links.
  return filled.replace(
    /\[\[([^\]]+)\]\(mailto:[^)]+\)\]\(mailto:\[[^\]]+\]\(mailto:([^)]+)\)\)/g,
    '[$1](mailto:$2)',
  );
}

/** The sources' comments are notes for the operator, never for readers. */
const source = (file) =>
  readFileSync(join(SOURCES, file), 'utf8').replace(/<!--[\s\S]*?-->\n?/g, '');

/** Bare hosts are autolinked as http://; every site these pages link to serves https. */
const render = (markdown) =>
  marked.parse(markdown, { gfm: true }).replaceAll('href="http://', 'href="https://');

const STYLE = `:root { --bg: #fbfaf7; --fg: #1d1b26; --muted: #5d5a6b; --line: #dedbe6; --accent: #4b3f8f; color-scheme: light dark; }
@media (prefers-color-scheme: dark) { :root { --bg: #14121c; --fg: #ece9f5; --muted: #a9a5ba; --line: #2f2b3d; --accent: #b3a7f5; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 17px/1.6 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 46rem; margin: 0 auto; padding: 2rem 16px 4rem; }
h1 { font-size: 1.9rem; line-height: 1.25; margin: 0 0 .5rem; }
h2 { font-size: 1.35rem; margin: 2.5rem 0 .5rem; padding-top: 1rem; border-top: 1px solid var(--line); }
h3 { font-size: 1.1rem; margin: 1.75rem 0 .25rem; }
a { color: var(--accent); overflow-wrap: anywhere; }
table { border-collapse: collapse; width: 100%; display: block; overflow-x: auto; font-size: .95rem; }
th, td { border: 1px solid var(--line); padding: .45rem .6rem; text-align: left; vertical-align: top; }
th { background: color-mix(in srgb, var(--line) 40%, transparent); }
code { font-size: .9em; }
nav { font-size: .95rem; margin-bottom: 1.5rem; color: var(--muted); }`;

const NOTICE_STYLE = `.notice { margin: 0 0 1.5rem; padding: .7rem .9rem; border: 1px solid var(--line); border-left: .3rem solid var(--accent); }`;

/**
 * What every page says at its top until Night Courier has started. Each is
 * true on its own: no hosted project, so no accounts and nothing the app could
 * process. Opening the page itself is another matter (GitHub logs the visit),
 * and the policy's section on the web pages covers that already.
 */
const NOTICES = {
  policy: {
    de: '<strong>Night Courier ist noch nicht gestartet.</strong> Diese Erklärung beschreibt, wie die App ab ihrem Start mit deinen Daten umgeht. Bis dahin gibt es keine Konten, und die App verarbeitet keine personenbezogenen Daten.',
    en: '<strong>Night Courier has not started yet.</strong> This policy describes how the app will handle your data from the day it starts. Until then there are no accounts, and the app processes no personal data.',
  },
  help: {
    de: '<strong>Night Courier ist noch nicht gestartet.</strong> Was diese Seite über die App und deine Daten sagt, gilt ab ihrem Start. Bis dahin gibt es keine Konten, und die App verarbeitet keine personenbezogenen Daten.',
    en: '<strong>Night Courier has not started yet.</strong> What this page says about the app and your data holds from the day it starts. Until then there are no accounts, and the app processes no personal data.',
  },
};

const notice = (kind, lang) =>
  env.LAUNCH_STATE === 'live' ? '' : `<p class="notice" role="note">${NOTICES[kind][lang]}</p>\n`;

const page = ({ lang, title, nav, body }) => `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
${body.includes('class="notice"') ? `${STYLE}\n${NOTICE_STYLE}` : STYLE}
</style>
</head>
<body>
<main>
${nav ? `<nav>${nav}</nav>\n` : ''}${body}
</main>
</body>
</html>
`;

const POLICIES = {
  de: {
    title: 'Datenschutzerklärung – Night Courier',
    date: longDate('de-CH'),
    address: env.OPERATOR_ADDRESS_DE,
    nav: '<a href="index.html">Hilfe und Kontakt</a> · <a href="privacy-policy.en.html" hreflang="en">English version</a>',
  },
  en: {
    title: 'Privacy policy – Night Courier',
    date: longDate('en-GB'),
    address: env.OPERATOR_ADDRESS_EN,
    nav: '<a href="index.html">Help and contact</a> · <a href="privacy-policy.de.html" hreflang="de">Deutsche Fassung</a>',
  },
};

const pages = {};

for (const [lang, policy] of Object.entries(POLICIES)) {
  const file = `privacy-policy.${lang}.md`;
  const markdown = fill(
    source(file),
    {
      OPERATOR_NAME: env.OPERATOR_NAME,
      OPERATOR_ADDRESS: policy.address,
      CONTACT_EMAIL: email,
      EFFECTIVE_DATE: policy.date,
      SUPPORT_URL: link(env.SITE_URL),
      PRIVACY_POLICY_URL: link(`${env.SITE_URL}privacy-policy.de.html`),
    },
    file,
  );
  pages[`privacy-policy.${lang}.html`] = page({
    lang,
    title: policy.title,
    nav: policy.nav,
    // Directly under the navigation, above the heading: nobody reads past it.
    body: notice('policy', lang) + render(markdown),
  });
}

{
  const markdown = fill(
    source('support-page.md'),
    {
      OPERATOR_NAME: env.OPERATOR_NAME,
      OPERATOR_ADDRESS: env.OPERATOR_ADDRESS_EN,
      CONTACT_EMAIL: email,
      SUPPORT_URL: link(env.SITE_URL),
      PRIVACY_POLICY_URL: '[English](privacy-policy.en.html) · [Deutsch](privacy-policy.de.html)',
    },
    'support-page.md',
  );
  // The page is English first, then a line, then the same in German. The
  // German half is wrapped so that a screen reader changes its voice for all of
  // it, not for the heading alone.
  const halves = markdown.split(/^---$/m);
  if (halves.length !== 2)
    fail('support-page.md: expected one line of --- between the English and the German half');
  const [english, german] = halves.map(render);

  // "Deutsch weiter unten" links to the German heading the way GitHub names a
  // heading, so that it also works where the Markdown itself is shown. The same
  // name goes on the German half here; the check below then catches a heading
  // reworded without its link.
  const heading = german.match(/<h1>(.*?)<\/h1>/)?.[1];
  if (!heading) fail('support-page.md: the German half has no heading');
  // The notice is the first thing in each half, so that whoever follows the
  // link to the German half lands on it.
  const body =
    `${notice('help', 'en')}${english}<hr>\n` +
    `<div lang="de" id="${anchor(heading)}">\n${notice('help', 'de')}${german}</div>`;
  pages['index.html'] = page({ lang: 'en', title: 'Night Courier – help and contact', body });
}

/** A heading's name in a link, as GitHub derives it: "A – b" becomes "a--b". */
function anchor(heading) {
  return heading
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s/g, '-');
}

for (const [name, html] of Object.entries(pages)) {
  for (const [, target] of html.matchAll(/href="#([^"]*)"/g)) {
    if (!html.includes(` id="${target}"`))
      fail(`${name} links to #${target}, which is nowhere on the page`);
  }
}

/**
 * The elements that are there to run or to embed something, refused whatever
 * their attributes say: a script without src runs all the same.
 */
const LOADING_ELEMENTS =
  /<(applet|base|embed|frame|frameset|iframe|img|link|object|portal|script)\b/i;

/**
 * The attributes that fetch what they name, on whichever element they stand:
 * an image's src or srcset, a video's poster, a table's background, the
 * address a followed link pings, an <object>'s data.
 */
const LOADING_ATTRIBUTES = [
  'archive',
  'background',
  'codebase',
  'data',
  'dynsrc',
  'imagesrcset',
  'lowsrc',
  'manifest',
  'ping',
  'poster',
  'src',
  'srcset',
];

/** A tag: its name, and what stands in it, a quoted value read whole - a > in one ends nothing. */
const TAG = /<([a-z][^\s/>]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/gi;

/** An attribute in what stands in a tag: its name, and its value if it has one. */
const ATTRIBUTE = /([^\s"'<>/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/g;

/**
 * What in `html` would have a browser fetch something, or run a script that
 * could, as the page is shown - said as the build says it - or null. A link
 * fetches nothing until it is followed: <a href> is how the pages lead to each
 * other and to the sites they name, and stays. On anything else - an SVG
 * <image> or <use>, a <base> - href fetches, and so does xlink:href.
 */
function whatLoads(html) {
  const element = LOADING_ELEMENTS.exec(html);
  if (element) return `<${element[1].toLowerCase()}>`;
  for (const [, tagName, inside] of html.matchAll(TAG)) {
    const tag = tagName.toLowerCase();
    for (const [, attributeName, quoted = ''] of inside.matchAll(ATTRIBUTE)) {
      const attribute = attributeName.toLowerCase();
      // Without its quotes and, as a browser reads an address, without blank space.
      const value = quoted.replace(/^["']|["']$|\s/g, '').toLowerCase();
      if (LOADING_ATTRIBUTES.includes(attribute)) return `${attribute}= on <${tag}>`;
      if ((attribute === 'href' || attribute === 'xlink:href') && tag !== 'a') {
        return `${attribute}= on <${tag}>`;
      }
      // An event's handler is a script, and so is a javascript: link.
      if (/^on/.test(attribute)) return `${attribute}= on <${tag}>`;
      if (attribute === 'href' && value.startsWith('javascript:')) return 'a javascript: link';
      // Another page, fetched in this one's place as it is shown.
      if (attribute === 'http-equiv' && value === 'refresh') {
        return `http-equiv=refresh on <${tag}>`;
      }
    }
  }
  // A style that reaches out, in a <style> or a style= alike.
  return /@import|url\(|image-set\(/i.exec(html)?.[0].toLowerCase() ?? null;
}

for (const [name, html] of Object.entries(pages)) {
  const loads = whatLoads(html);
  if (loads) {
    fail(
      `${name} would load something from elsewhere (${loads}); the privacy policy promises it ` +
        'does not',
    );
  }
  if (/\{\{|<!--/.test(html)) fail(`${name} still has a placeholder or a note`);
}

const ROOT_PAGE = page({
  lang: 'en',
  title: 'Night Courier',
  body: '<p><a href="night-courier/">Night Courier – help, contact and privacy</a></p>',
}).replace(
  '<meta name="viewport"',
  '<meta http-equiv="refresh" content="0; url=night-courier/">\n<meta name="viewport"',
);

mkdirSync(join(OUT, 'night-courier'), { recursive: true });
for (const [name, html] of Object.entries(pages))
  writeFileSync(join(OUT, 'night-courier', name), html);
writeFileSync(join(OUT, 'index.html'), ROOT_PAGE);
writeFileSync(join(OUT, '.nojekyll'), '');

const state = agreementSigned
  ? `live: no notice (processing agreement signed ${longDate('en-GB', agreementSigned)})`
  : 'not started yet: every page carries the notice';
console.log(
  `Built ${Object.keys(pages).length + 1} pages into ${OUT}, dated ${POLICIES.en.date}, ${state}.`,
);
