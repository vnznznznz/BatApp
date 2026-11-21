import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { definesFunction } from './migrations.mjs';

/**
 * The documents name database functions: the runbooks have the operator call
 * them, and the public pages promise what they do. Whether the tree really has
 * such a function is asked in two places - before the pages are built, and
 * before a runbook's statement is run in the tests - and both ask here.
 */

let folder;

beforeEach(() => {
  folder = mkdtempSync(join(tmpdir(), 'migrations-'));
});

afterEach(() => {
  rmSync(folder, { recursive: true, force: true });
});

const migration = (name, sql) => writeFileSync(join(folder, name), sql);

describe('whether a migration defines a function', () => {
  it('is yes for a function one of them creates, however it is spelt', () => {
    for (const sql of [
      'create or replace function private.delete_account(courier uuid)\nreturns void',
      'create function private.delete_account(courier uuid) returns void',
      'CREATE OR REPLACE FUNCTION private.delete_account (courier uuid)',
      '  create  or  replace  function  private.delete_account(\n  courier uuid\n)',
    ]) {
      migration('20260101000000_one.sql', sql);
      assert.equal(definesFunction('private.delete_account', folder), true, sql);
    }
  });

  it('is yes when a later migration of several creates it', () => {
    migration('20260101000000_one.sql', 'create table public.things (id uuid primary key);');
    migration('20260102000000_two.sql', 'create function private.delete_account(courier uuid)');

    assert.equal(definesFunction('private.delete_account', folder), true);
  });

  // Each of these stood in a migration of this repository, or could: none of
  // them makes the function exist.
  it('is no for a function that is only spoken of', () => {
    for (const sql of [
      '-- delete (private.delete_account, below).',
      '-- create or replace function private.delete_account(courier uuid)',
      '/*\ncreate function private.delete_account(courier uuid)\n*/',
      'revoke all on function private.delete_account(uuid) from public, anon, authenticated;',
      'grant execute on function private.delete_account(uuid) to service_role;',
      "comment on function private.delete_account(uuid) is 'for the operator';",
      'drop function if exists private.delete_account(uuid);',
      'create function private.delete_account_log(courier uuid)',
      'create function public.delete_account(courier uuid)',
      'create function private_delete_account(courier uuid)',
      'select private.delete_account($1);',
    ]) {
      migration('20260101000000_one.sql', sql);
      assert.equal(definesFunction('private.delete_account', folder), false, sql);
    }
  });

  it('is no for a folder without migrations, and reads nothing but .sql', () => {
    assert.equal(definesFunction('private.delete_account', folder), false);

    migration('notes.md', 'create function private.delete_account(courier uuid)');
    assert.equal(definesFunction('private.delete_account', folder), false);
  });

  it('looks at this repository’s own migrations unless told otherwise', () => {
    assert.equal(definesFunction('public.delete_own_account'), true);
    assert.equal(definesFunction('private.remove_account'), true);
    assert.equal(definesFunction('private.tidy_up'), true);
    assert.equal(definesFunction('private.no_such_function'), false);
  });
});
