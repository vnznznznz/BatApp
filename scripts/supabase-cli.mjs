/**
 * The one Supabase CLI version this repository's commands are written for.
 *
 * `npx supabase` without a version runs whatever is newest that day, and the
 * versions differ in what the same words do: version 2 pushes migrations to the
 * linked project, version 3 to the local stack unless `--remote` is given;
 * version 2 answers its own question with "no" when nobody is there and reports
 * success, version 3 stops. So every command in the documents names this
 * version, `npx supabase@3.2.0 ...`, and supabase-cli.test.mjs fails when one
 * does not.
 *
 * To move to a newer version: try the commands of docs/GO-LIVE.md, "Setting up
 * the hosted project", with it first, then change the number here and in the
 * documents the test lists.
 */
export const SUPABASE_CLI_VERSION = '3.2.0';

/** What to hand to npx. */
export const SUPABASE_CLI = `supabase@${SUPABASE_CLI_VERSION}`;
