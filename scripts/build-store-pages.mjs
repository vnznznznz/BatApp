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
 *   CONTACT_EMAIL='…' EFFECTIVE_DATE=2026-11-10 \
 *   SITE_URL=https://vnznznznz.github.io/night-courier/ \
 *   npm run build:pages -- --out ../vnznznznz.github.io
 *
 * --out is the site repository's checkout. The pages go into its folder
 * night-courier/ (index.html is the help page), with a redirect at its root and
 * a .nojekyll, so that GitHub serves the files as they are: no theme, nothing
 * loaded from anywhere else. Then commit and push there. docs/GO-LIVE.md,
 * "The web pages", has the whole procedure.
 *
 * Refuses to build when a value is missing, a placeholder is left over, or a
 * page would load anything from another site - the privacy policy promises it
 * does not.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { marked } from 'marked';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = join(ROOT, 'docs', 'store');

const REQUIRED = [
  'OPERATOR_NAME',
  'OPERATOR_ADDRESS_DE',
  'OPERATOR_ADDRESS_EN',
  'CONTACT_EMAIL',
  'EFFECTIVE_DATE',
  'SITE_URL',
];

function fail(message) {
  console.error(`build-store-pages: ${message}`);
  process.exit(1);
}

const outIndex = process.argv.indexOf('--out');
const outArg = outIndex === -1 ? undefined : process.argv[outIndex + 1];
if (!outArg) fail('pass --out <the site repository checkout>');
const OUT = resolve(outArg);

const missing = REQUIRED.filter((name) => !process.env[name]?.trim());
if (missing.length) fail(`set ${missing.join(', ')} (see the comment at the top of this file)`);

const env = Object.fromEntries(REQUIRED.map((name) => [name, process.env[name].trim()]));
if (!/^https:\/\/.+\/$/.test(env.SITE_URL)) fail('SITE_URL must be an https URL ending in /');
if (!/^\d{4}-\d{2}-\d{2}$/.test(env.EFFECTIVE_DATE)) fail('EFFECTIVE_DATE must be YYYY-MM-DD');

const date = new Date(`${env.EFFECTIVE_DATE}T12:00:00Z`);
const longDate = (locale) =>
  new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);

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

const page = ({ lang, title, nav, body }) => `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
${STYLE}
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
    body: render(markdown),
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
  // The German half's heading is the target of "Deutsch weiter unten".
  const body = render(markdown).replace(
    '<h1>Night Courier – Hilfe und Kontakt</h1>',
    '<h1 id="night-courier--hilfe-und-kontakt" lang="de">Night Courier – Hilfe und Kontakt</h1>',
  );
  pages['index.html'] = page({ lang: 'en', title: 'Night Courier – help and contact', body });
}

for (const [name, html] of Object.entries(pages)) {
  if (/<script|<link\b|<iframe|<img|\ssrc=|@import|url\(/i.test(html)) {
    fail(`${name} would load something from elsewhere; the privacy policy promises it does not`);
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

console.log(`Built ${Object.keys(pages).length + 1} pages into ${OUT}, dated ${POLICIES.en.date}.`);
