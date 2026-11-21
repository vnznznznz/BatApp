import { EMAIL_CODE_LENGTH } from '@/features/auth/validation';

// Node built-ins, typed by hand: the project's tsconfig deliberately leaves out
// Node's types, which describe nothing that exists in React Native.
declare const __dirname: string;
const { existsSync, readFileSync } = jest.requireActual<{
  existsSync: (path: string) => boolean;
  readFileSync: (path: string, encoding: 'utf8') => string;
}>('fs');
const { join } = jest.requireActual<{ join: (...parts: string[]) => string }>('path');

/**
 * The emails the auth server sends carry a code to type into the app, and no
 * link: a link came back through the app's URL scheme, with a whole session
 * that any app answering to the scheme could take. supabase/config.toml says
 * how the codes are made and which templates carry them; the local stack reads
 * it as it starts, and `config push` takes it to the hosted project.
 */

const ROOT = join(__dirname, '..', '..');

/**
 * The tables of a TOML file, as far as these tests read one: each [table]'s
 * keys with their values, strings without their quotes. Arrays and anything
 * spread over lines are left as written.
 */
function tablesOf(toml: string): Map<string, Map<string, string>> {
  const tables = new Map<string, Map<string, string>>([['', new Map()]]);
  let current = tables.get('') as Map<string, string>;
  for (const line of toml.split('\n')) {
    const text = line.replace(/\s+#.*$/, '').trim();
    if (!text || text.startsWith('#')) continue;
    const table = /^\[([^\]]+)\]$/.exec(text);
    if (table) {
      current = new Map();
      tables.set(table[1] as string, current);
      continue;
    }
    const pair = /^([\w-]+)\s*=\s*(.+)$/.exec(text);
    if (pair) current.set(pair[1] as string, (pair[2] as string).replace(/^"(.*)"$/, '$1'));
  }
  return tables;
}

const config = tablesOf(readFileSync(join(ROOT, 'supabase', 'config.toml'), 'utf8'));
const email = config.get('auth.email') ?? new Map<string, string>();

const TEMPLATES = ['confirmation', 'recovery'] as const;

/** A template's text, read from where config.toml says it is. */
function template(kind: (typeof TEMPLATES)[number]): string {
  const path = config.get(`auth.email.template.${kind}`)?.get('content_path') ?? '';
  return readFileSync(join(ROOT, path), 'utf8');
}

/** What an email says, as the auth server fills the template in. */
const filledIn = (text: string, code: string) => text.replace(/\{\{\s*\.Token\s*\}\}/g, code);

/** The words of an email, without its markup. */
const wordsOf = (html: string) =>
  html
    .replace(/<head>[\s\S]*<\/head>/, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('the codes in the emails', () => {
  it('have as many digits as the app asks for', () => {
    expect(email.get('otp_length')).toBe(String(EMAIL_CODE_LENGTH));
  });

  /**
   * Someone who signs up in the evening may open the mail the next morning,
   * and the hour the auth server gives a code by itself has run out by then.
   */
  it('work for a day', () => {
    expect(email.get('otp_expiry')).toBe('86400');
  });

  /**
   * Turned on with custom SMTP, before anyone else joins (docs/GO-LIVE.md),
   * and not before: the app works either way.
   */
  it('leave email confirmation as it is', () => {
    expect(email.get('enable_confirmations')).toBe('false');
  });
});

describe.each(TEMPLATES)('the %s email', (kind) => {
  const settings = config.get(`auth.email.template.${kind}`);

  it('has a template of its own, and a subject that says what is in it', () => {
    expect(settings?.get('subject')).toBe('Your Night Courier code');
    expect(settings?.get('content_path')).toBe(`./supabase/templates/${kind}.html`);
    expect(existsSync(join(ROOT, settings?.get('content_path') ?? 'missing'))).toBe(true);
  });

  it('carries the code, and nothing else of the auth server’s', () => {
    const text = template(kind);

    expect(text.match(/\{\{[^}]*\}\}/g)).toEqual(['{{ .Token }}']);
  });

  /**
   * No link at all - none to the app, none to a website, none through the auth
   * server, which would sign in whoever followed it.
   */
  it('has no link in it', () => {
    const text = template(kind);

    expect(text).not.toMatch(/<a[\s>]/i);
    expect(text).not.toMatch(/href|https?:|nightcourier:|ConfirmationURL|TokenHash|SiteURL/i);
  });

  it('shows the code large, on a line of its own', () => {
    const code = filledIn(template(kind), '73483481');
    const line = /<p[^>]*>\s*73483481\s*<\/p>/.exec(code)?.[0] ?? '';

    expect(line).toMatch(/font-size:\s*(3\d|4\d)px/);
    expect(wordsOf(code)).toContain('73483481');
  });

  it('says what to do with the code, and how long it works', () => {
    const words = wordsOf(filledIn(template(kind), '73483481'));

    expect(words).toMatch(/Type it into the app/);
    expect(words).toMatch(/It works for a day, and only the newest code counts\./);
  });
});

describe('the words of each email', () => {
  it('say what the confirmation code is for, and what to do if nobody here asked for it', () => {
    expect(wordsOf(filledIn(template('confirmation'), '73483481'))).toBe(
      'Here is the code that confirms your email address for Night Courier: 73483481 Type it ' +
        'into the app, on the screen that asks for it, and your bats will be waiting. It works ' +
        'for a day, and only the newest code counts. If you did not sign up for Night Courier, ' +
        'you can ignore this email: without the code the sign-up goes nowhere, and it is ' +
        'deleted after a week.',
    );
  });

  it('say what the reset code is for, and that the password stays as it is without it', () => {
    expect(wordsOf(filledIn(template('recovery'), '65130536'))).toBe(
      'Here is the code for setting a new password for Night Courier: 65130536 Type it into ' +
        'the app, with your new password. It works for a day, and only the newest code counts. ' +
        'If you did not ask for a new password, you can ignore this email: your password stays ' +
        'as it is.',
    );
  });
});
