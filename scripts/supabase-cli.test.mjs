import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { SUPABASE_CLI_VERSION } from './supabase-cli.mjs';

/**
 * The runbooks are followed word for word, by a session with nobody at the
 * keyboard. A Supabase command without a version runs whatever is newest that
 * day, and one without the right flag asks a question nobody answers or goes to
 * the wrong database - and says it succeeded. This reads every command the
 * repository's documents and scripts name and holds them to the version and the
 * flags they were tried with.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLACES = ['README.md', '.env.example', '.github', 'docs', 'scripts', 'src', 'supabase'];
const TEXT = /\.(md|mjs|js|ts|tsx|toml|sql|yml|json|example)$/;

function files(path) {
  const stat = statSync(path);
  if (stat.isFile()) return TEXT.test(path) ? [path] : [];
  return readdirSync(path)
    .filter((name) => name !== 'node_modules' && !name.startsWith('.temp'))
    .flatMap((name) => files(join(path, name)));
}

/**
 * Every `npx supabase ...` in the repository: where it is, its version, its
 * words. A command continued over lines with a backslash is read as one. The
 * bare words `npx supabase`, with nothing after them, are how the documents
 * talk about the unpinned command; they are not a command anyone would run.
 */
function commands() {
  const found = [];
  for (const file of PLACES.flatMap((place) => files(join(ROOT, place)))) {
    // This file and the pin talk about commands without being runbooks.
    if (/supabase-cli(\.test)?\.mjs$/.test(file)) continue;
    // \u0000 stands for a line break that a backslash continued over.
    const text = readFileSync(file, 'utf8').replace(/\\\n\s*/g, '\u0000 ');
    for (const match of text.matchAll(/npx\s+(?:--yes\s+)?supabase(@[\w.-]+)?([^`\n]*)/g)) {
      const words = match[2].replaceAll('\u0000', '').trim();
      if (!match[1] && !words) continue;
      found.push({
        where: `${relative(ROOT, file)}:${text.slice(0, match.index).split(/[\n\u0000]/).length}`,
        version: match[1] ?? '',
        words,
      });
    }
  }
  return found;
}

const all = commands();
const starting = (words) => all.filter((command) => command.words.startsWith(words));

describe('the Supabase commands in the documents', () => {
  it('are found at all, in the places that are known to have them', () => {
    for (const file of [
      'README.md',
      'docs/GO-LIVE.md',
      'supabase/config.toml',
      'supabase/seed.sql',
    ])
      assert.ok(
        all.some((command) => command.where.startsWith(`${file}:`)),
        `no command found in ${file}`,
      );
  });

  it('all name the one version they were tried with', () => {
    const others = all.filter((command) => command.version !== `@${SUPABASE_CLI_VERSION}`);
    assert.deepEqual(
      others.map((command) => `${command.where}: npx supabase${command.version}`),
      [],
    );
  });

  it('are run with that version by the script that generates the types', () => {
    const script = readFileSync(join(ROOT, 'scripts', 'generate-types.mjs'), 'utf8');
    assert.match(script, /import \{ SUPABASE_CLI \} from '\.\/supabase-cli\.mjs'/);
    assert.match(script, /\['--yes', SUPABASE_CLI,/);
  });

  // Version 3 changes a hosted project only when told --yes: where nobody can
  // answer, it stops instead. A runbook command without it does nothing.
  it('say --yes wherever they change the hosted project', () => {
    const changing = [
      ...starting('projects create'),
      ...starting('config push'),
      ...starting('db push').filter((command) => !command.words.includes('--dry-run')),
      ...starting('db query').filter((command) => !command.words.includes('--read-only')),
    ];
    assert.ok(changing.length >= 3, 'expected to find the commands that change the project');
    assert.deepEqual(
      changing.filter((command) => !/(^|\s)--yes(\s|$)/.test(command.words)),
      [],
    );
  });

  // Without --remote, version 3 pushes to, asks and lists the local stack, even
  // in a linked directory. Nothing in the documents pushes migrations locally.
  it('say --remote wherever they mean the hosted database', () => {
    const hosted = [...starting('db push'), ...starting('db query'), ...starting('migration list')];
    assert.ok(hosted.length >= 3, 'expected to find the commands that reach the hosted database');
    assert.deepEqual(
      hosted.filter((command) => !/(^|\s)--remote(\s|$)/.test(command.words)),
      [],
    );
  });

  // Either would put the two demo accounts, whose password is printed in the
  // README, on the hosted project; a reset would empty it first.
  it('never seed or reset the hosted database', () => {
    assert.deepEqual(
      all.filter(
        (command) =>
          command.words.includes('--include-seed') ||
          (command.words.startsWith('db reset') && /--remote|--linked/.test(command.words)),
      ),
      [],
    );
  });
});
