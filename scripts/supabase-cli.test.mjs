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
 * The ways a package is run without being installed, and the ways a package
 * manager runs one that is. The documents use the first of them only; the rest
 * are here so that a command typed for another one is still read.
 */
const RUNNER = String.raw`npx|pnpx|bunx|npm\s+(?:exec|x)|pnpm\s+(?:dlx|exec)|yarn\s+dlx|bun\s+x|yarn|pnpm|bun`;

/**
 * What may stand between the runner and the CLI's name: -y, --yes, --, and the
 * package named apart from the command (-p supabase, --package=supabase).
 */
const OPTIONS = String.raw`(?:\s+-{1,2}[\w=@.-]*|\s+supabase(?:@[\w.-]+)?(?=\s+supabase\b))*`;

/** What `supabase --help` of the pinned version lists: a CLI that is installed is run by these words. */
const SUBCOMMANDS =
  'backups|bootstrap|branches|completion|config|db|domains|encryption|feedback|functions|gen|init|' +
  'inspect|issue|link|login|logout|logs|migrations?|network-bans|network-restrictions|notebooks|orgs|' +
  'postgres-config|projects|pull|secrets|seed|services|snippets|ssl-enforcement|sso|start|status|' +
  'stop|storage|telemetry|test|unlink|vanity-subdomains|whoami';

/**
 * The CLI's name with what may stand before it. What follows is read apart,
 * up to the end of the line or of the code span, so that the search can go on
 * directly behind the name: a line can hold a second command, or a folder
 * named supabase/ in front of a command.
 */
const CALL = new RegExp(
  String.raw`(?:(?<![\w/.-])(${RUNNER})(${OPTIONS})\s+)?(?<![\w@/.$-])supabase(@[\w.-]+)?(?![\w-])`,
  'g',
);
const SUBCOMMAND = new RegExp(`^(?:${SUBCOMMANDS})(?![\\w-])`);

/**
 * Every Supabase command in a text: where it is, how the CLI is called, and
 * its words. A command continued over lines with a backslash is read as one.
 *
 * `call` is what decides the version: "npx supabase@3.2.0" for the form the
 * documents use (npx's own --yes makes no difference to it), and otherwise the
 * call as it was written - another runner, another version, or the bare word
 * `supabase`, which runs whatever CLI happens to be installed.
 *
 * Two things are not commands. The words `npx supabase` with nothing after
 * them are how the documents talk about the unpinned command. And the word
 * `supabase` on its own is a folder, a host or a package wherever it is not
 * followed by one of the CLI's subcommands.
 */
function commandsIn(source) {
  const found = [];
  // \u0000 stands for a line break that a backslash continued over.
  const text = source.replace(/\\\n\s*/g, '\u0000 ');
  for (const match of text.matchAll(CALL)) {
    const [whole, runner, options = '', version = ''] = match;
    const rest = text.slice(match.index + whole.length).match(/^[^`\n]*/)[0];
    const words = rest.replaceAll('\u0000', ' ').replace(/\s+/g, ' ').trim();
    if (runner ? !version && !words : !SUBCOMMAND.test(words)) continue;
    const plainNpx = runner === 'npx' && /^(?:\s+(?:-y|--yes))?$/.test(options);
    found.push({
      line: text.slice(0, match.index).split(/[\n\u0000]/).length,
      call: plainNpx
        ? `npx supabase${version}`
        : `${runner ? `${runner}${options} ` : ''}supabase${version}`.replace(/\s+/g, ' '),
      version,
      words,
    });
  }
  return found;
}

/** The same for every document and script of the repository. */
function commands() {
  return (
    PLACES.flatMap((place) => files(join(ROOT, place)))
      // This file and the pin talk about commands without being runbooks.
      .filter((file) => !/supabase-cli(\.test)?\.mjs$/.test(file))
      .flatMap((file) =>
        commandsIn(readFileSync(file, 'utf8')).map((command) => ({
          ...command,
          where: `${relative(ROOT, file)}:${command.line}`,
        })),
      )
  );
}

const PINNED = `npx supabase@${SUPABASE_CLI_VERSION}`;

const all = commands();
const starting = (words) => all.filter((command) => command.words.startsWith(words));
/** The flag as a word of its own: `--yes`, also before a quote or a comma, but not `--yes-please`. */
const has = (command, flag) => new RegExp(`(^|\\s)${flag}(?![\\w-])`).test(command.words);

/**
 * The reading above is what the rest of this file stands on: a command it does
 * not see is a command nothing here holds to anything. It once knew `npx` and
 * `npx --yes` only (found in review), so the same command typed for another
 * runner, or for a CLI that happens to be installed, went through unread.
 */
describe('reading the commands out of a text', () => {
  const calls = (text) => commandsIn(text).map((command) => command.call);

  it('finds a command that names no version, whichever way it is run', () => {
    for (const unpinned of [
      'npx supabase db push --remote',
      'npx -y supabase db push --remote',
      'npx --yes supabase db push --remote',
      'npx --yes -- supabase db push --remote',
      'npx -p supabase supabase db push --remote',
      'npx --package=supabase supabase db push --remote',
      'npm exec supabase db push --remote',
      'npm exec -- supabase db push --remote',
      'npm x supabase db push --remote',
      'pnpm dlx supabase db push --remote',
      'pnpm exec supabase db push --remote',
      'pnpx supabase db push --remote',
      'yarn dlx supabase db push --remote',
      'yarn supabase db push --remote',
      'bunx supabase db push --remote',
      'bun x supabase db push --remote',
      'supabase db push --remote',
      '  supabase link --project-ref abcdefghijklmnopqrst',
      'Then run `supabase config push` and wait.',
      'cd app && supabase migration list --remote',
      'The file supabase/config.toml is pushed with npx supabase config push',
      'See supabase/migrations, which supabase db push --remote applies.',
    ]) {
      const found = calls(unpinned);
      assert.equal(found.length, 1, `not read as a command: ${unpinned}`);
      assert.notEqual(found[0], PINNED, unpinned);
    }
  });

  it('finds a command that names another version, or the right one in another way', () => {
    for (const other of [
      'npx supabase@latest db push --remote',
      'npx supabase@2.122.0 db push --remote',
      'npx supabase@3 db push --remote',
      `bunx supabase@${SUPABASE_CLI_VERSION} db push --remote`,
      `npm exec supabase@${SUPABASE_CLI_VERSION} db push --remote`,
      `npx -p supabase@${SUPABASE_CLI_VERSION} supabase db push --remote`,
    ]) {
      const found = calls(other);
      assert.ok(found.length >= 1, `not read as a command: ${other}`);
      assert.ok(
        found.some((call) => call !== PINNED),
        other,
      );
    }
  });

  it('takes the pinned command as it is written in the documents, and with --yes for npx', () => {
    assert.deepEqual(commandsIn(`${PINNED} db push --remote --yes`), [
      {
        line: 1,
        call: PINNED,
        version: `@${SUPABASE_CLI_VERSION}`,
        words: 'db push --remote --yes',
      },
    ]);
    assert.deepEqual(calls(`npx --yes supabase@${SUPABASE_CLI_VERSION} gen types typescript`), [
      PINNED,
    ]);
    // Something in front of it - the password for one command - changes nothing.
    assert.deepEqual(calls(`PASSWORD="$(cat file)" ${PINNED} db push --remote --yes`), [PINNED]);
  });

  // The rest of a line belongs to the command that starts it, as its words. A
  // second command on the same line is still a command.
  it('finds a second command on a line, behind the first', () => {
    assert.deepEqual(calls(`${PINNED} link --project-ref abc && supabase db push --remote`), [
      PINNED,
      'supabase',
    ]);
    assert.deepEqual(calls(`${PINNED} config diff; npx supabase config push --yes`), [
      PINNED,
      'npx supabase',
    ]);
  });

  it('reads a command continued over lines as one, and says where it starts', () => {
    const text = `first line\n${PINNED} projects create night-courier \\\n  --region eu-central-2 --yes\n`;

    assert.deepEqual(commandsIn(text), [
      {
        line: 2,
        call: PINNED,
        version: `@${SUPABASE_CLI_VERSION}`,
        words: 'projects create night-courier --region eu-central-2 --yes',
      },
    ]);
  });

  it('does not take for a command what only talks about one', () => {
    for (const prose of [
      '`npx supabase` alone runs whatever is newest that day.',
      'The file is supabase/config.toml, beside supabase/migrations.',
      'Create the Supabase project in Zurich; Supabase projects on the free plan can pause.',
      'The app uses supabase-js, in src/lib/supabase.ts.',
      'It records each one in supabase_migrations.schema_migrations.',
      'https://<ref>.supabase.co/auth/v1/settings',
      'the local supabase stack, and what Supabase start would print',
    ])
      assert.deepEqual(commandsIn(prose), [], prose);
  });
});

describe('the Supabase commands in the documents', () => {
  it('are found at all, in the places that are known to have them', () => {
    for (const file of [
      'README.md',
      'docs/GO-LIVE.md',
      'docs/store/gdpr-records.md',
      'supabase/config.toml',
      'supabase/seed.sql',
    ])
      assert.ok(
        all.some((command) => command.where.startsWith(`${file}:`)),
        `no command found in ${file}`,
      );
  });

  it('all name the one version they were tried with', () => {
    const others = all.filter((command) => command.call !== PINNED);
    assert.deepEqual(
      others.map((command) => `${command.where}: ${command.call}`),
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
      changing.filter((command) => !has(command, '--yes')),
      [],
    );
  });

  // Without --remote, version 3 pushes to, asks and lists the local stack, even
  // in a linked directory. Nothing in the documents pushes migrations locally.
  it('say --remote wherever they mean the hosted database', () => {
    const hosted = [...starting('db push'), ...starting('db query'), ...starting('migration list')];
    assert.ok(hosted.length >= 3, 'expected to find the commands that reach the hosted database');
    assert.deepEqual(
      hosted.filter((command) => !has(command, '--remote')),
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

/**
 * The commands of a document's shell code blocks, as a shell reads them: a
 * line that ends in a backslash, in && or in || goes on in the next. Each with
 * the line it starts on, its lines trimmed and joined by one space. Comment
 * lines are left out.
 */
function shellCommands(source) {
  const found = [];
  let inBlock = false;
  let current = null;
  source.split('\n').forEach((raw, index) => {
    const line = raw.trim();
    if (!inBlock) {
      inBlock = /^```(?:bash|sh)$/.test(line);
      return;
    }
    if (line === '```') {
      if (current) found.push(current);
      inBlock = false;
      current = null;
      return;
    }
    if (!current && (line === '' || line.startsWith('#'))) return;
    const text = line.replace(/\\$/, '').trim();
    current = current
      ? { ...current, text: `${current.text} ${text}`.trim() }
      : { line: index + 1, text };
    if (!/(\\|&&|\|\|)$/.test(line)) {
      found.push(current);
      current = null;
    }
  });
  return found;
}

/**
 * A session follows the runbooks with nobody at the keyboard, and gives each
 * command a shell of its own: nothing one command sets is there for the next.
 * GO-LIVE's step 1 once exported the database password for step 3, which would
 * have run without it (found in review) - and db push without a password does
 * not stop, it takes a temporary login role that nobody has tried on a real
 * project.
 */
describe('the runbooks, run one command at a time', () => {
  const PASSWORD_FILE = '~/.night-courier-db-password';
  const runbooks = ['README.md', ...files(join(ROOT, 'docs')).map((file) => relative(ROOT, file))]
    .filter((file) => file.endsWith('.md'))
    .map((file) => ({ file, commands: shellCommands(readFileSync(join(ROOT, file), 'utf8')) }));
  const where = (file, command) => `${file}:${command.line}: ${command.text}`;
  const every = (test) =>
    runbooks.flatMap(({ file, commands }) =>
      commands.filter(test).map((command) => where(file, command)),
    );

  it('are read at all', () => {
    const goLive = runbooks.find(({ file }) => file === 'docs/GO-LIVE.md');
    assert.ok(goLive.commands.length >= 20, 'expected the commands of GO-LIVE');
    assert.ok(
      goLive.commands.some((command) =>
        command.text.startsWith(`[ -s ${PASSWORD_FILE} ] && SUPABASE_DB_PASSWORD=`),
      ),
      'expected a db push of step 3, read over its three lines',
    );
  });

  it('export nothing for a later command to read', () => {
    assert.deepEqual(
      every((command) => /(?:^|[;&|(]\s*)export\s/.test(command.text)),
      [],
    );
  });

  it('hand every db push the database password, and do nothing where there is none', () => {
    const handed = [
      `[ -s ${PASSWORD_FILE} ] && SUPABASE_DB_PASSWORD="$(cat ${PASSWORD_FILE})" ${PINNED} db push `,
      `[ -n "$SUPABASE_DB_PASSWORD" ] && ${PINNED} db push `,
    ];
    const pushes = every((command) => /\bsupabase(?:@[\w.-]+)? db push\b/.test(command.text));
    assert.ok(pushes.length >= 4, 'expected the db push commands of README and GO-LIVE');
    assert.deepEqual(
      pushes.filter(
        (push) => !handed.some((start) => push.split(': ').slice(1).join(': ').startsWith(start)),
      ),
      [],
    );
  });

  // The file is the only copy of the password once the project exists: a
  // second password written over it would leave db push with the wrong one.
  it('make the password file once, readable by its owner only, and create the project from it', () => {
    const writes = every((command) => command.text.includes(`> ${PASSWORD_FILE}`));
    assert.equal(writes.length, 1, 'expected one command that writes the password file');
    assert.match(writes[0], /: \[ -s ~\/\.night-courier-db-password \] \|\| \(umask 077 && /);

    const creates = every((command) =>
      /\bsupabase(?:@[\w.-]+)? projects create\b/.test(command.text),
    );
    assert.equal(creates.length, 1, 'expected one projects create');
    assert.ok(
      creates[0].includes(`: [ -s ${PASSWORD_FILE} ] && ${PINNED} projects create `),
      creates[0],
    );
    assert.ok(creates[0].includes(`--db-password "$(cat ${PASSWORD_FILE})"`), creates[0]);
  });
});
