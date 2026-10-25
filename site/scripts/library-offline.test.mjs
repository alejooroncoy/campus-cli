import { test } from 'node:test';
import assert from 'node:assert/strict';
import { libraryDraftKey } from '../src/lib/library-draft.ts';
import { readOfflineOwner, rememberOfflineOwner, forgetOfflineOwner } from '../src/lib/library-offline.ts';
import { readFile } from 'node:fs/promises';
test('offline draft locator is account bound, contains no email and is invalidated on logout/account switch', async () => {
  const values = new Map();
  const storage = { getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key) };
  const key = await libraryDraftKey('student@example.org');
  rememberOfflineOwner(storage,{key,scope:'server-account-scope'});
  assert.deepEqual(readOfflineOwner(storage),{key,scope:'server-account-scope'});
  assert.ok(!JSON.stringify([...values]).includes('@'));
  storage.setItem('campus-session-revision-v1',JSON.stringify({identity:'guest'}));
  assert.equal(readOfflineOwner(storage),null);
  storage.setItem('campus-session-revision-v1',JSON.stringify({identity:'b'.repeat(64)}));
  assert.equal(readOfflineOwner(storage),null);
  storage.removeItem('campus-session-revision-v1');
  forgetOfflineOwner(storage);
  assert.equal(readOfflineOwner(storage),null);
});
test('the offline shell and all script dependencies are build-produced public files, never live pages or API data', async () => {
  const root = new URL('../dist/', import.meta.url);
  const assets = JSON.parse(await readFile(new URL('library-offline-assets.json', root), 'utf8'));
  const shell = await readFile(new URL('library-offline.html', root), 'utf8');
  assert.equal(shell, await readFile(new URL('app/biblioteca/index.html', root), 'utf8'));
  assert.match(shell, /data-library/);
  assert.ok(assets.includes('/biblioteca.css'));
  for (const path of assets) {
    assert.ok(!path.startsWith('/api/') && !path.startsWith('/app/'));
    const content = await readFile(new URL('.' + path.split('?')[0], root), 'utf8');
    if (path.endsWith('.js')) for (const match of content.matchAll(/["'](\.{1,2}\/[^"']+\.js)["']/g)) {
      assert.ok(assets.includes(new URL(match[1], 'https://campuscli.com' + path).pathname));
    }
  }
  assert.match(await readFile(new URL('sw.js', root), 'utf8'), /campus-shell-v15-[a-f0-9]{16}/);
});
