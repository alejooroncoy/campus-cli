import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Readable } from 'node:stream';
import test from 'node:test';
import {
  assertBlackboardFileUrl,
  assertPublicApiUrl,
  assertSameOrigin,
  assertTrustedBlackboardRedirect,
} from '../src/providers/blackboard/api/client.js';
import { blackboardCookies } from '../src/providers/blackboard/auth/session.js';
import {
  DOWNLOAD_QUOTA_LOCK,
  resolveDownloadDir,
  safeNewFilePath,
  writeLimitedDownload,
  writeNamedDownload,
} from '../src/security/files.js';
import { secureServiceUrl } from '../src/security/urls.js';

test('authenticated Blackboard requests stay on the exact HTTPS origin', () => {
  assert.doesNotThrow(() => assertSameOrigin('/learn/api/public/v1/users/me'));
  assert.doesNotThrow(() => assertSameOrigin('https://aulavirtual.upc.edu.pe/bbcswebdav/file'));
  assert.throws(() => assertSameOrigin('https://evil.example/file'), /non-Blackboard host/);
  assert.throws(() => assertSameOrigin('//evil.example/file'), /non-Blackboard host/);
  assert.throws(() => assertSameOrigin('http://aulavirtual.upc.edu.pe/file'), /non-Blackboard host/);
});

test('Blackboard signed-download redirects may use any Blackboard subdomain', () => {
  assert.doesNotThrow(() => assertTrustedBlackboardRedirect('https://aulavirtual.upc.edu.pe/bbcswebdav/file'));
  assert.doesNotThrow(() => assertTrustedBlackboardRedirect('https://alt-5f0d0e6d23ee0.blackboard.com/file'));
  assert.doesNotThrow(() => assertTrustedBlackboardRedirect('https://files.blackboard.com/file'));
  assert.doesNotThrow(() => assertTrustedBlackboardRedirect('https://blackboard.com/file'));
  assert.throws(
    () => assertTrustedBlackboardRedirect('https://evil.example/file'), /untrusted host/,
  );
  assert.throws(
    () => assertTrustedBlackboardRedirect('https://blackboard.com.evil.example/file'), /untrusted host/,
  );
});

test('raw API and direct download URLs are narrowed to their intended endpoints', () => {
  assert.doesNotThrow(() => assertPublicApiUrl('/learn/api/public/v1/users/me'));
  assert.throws(() => assertPublicApiUrl('/webapps/portal'), /restricted/);
  assert.doesNotThrow(() => assertBlackboardFileUrl('/bbcswebdav/xid-123'));
  assert.throws(() => assertBlackboardFileUrl('/learn/api/public/v1/users/me'), /Direct downloads/);
});

test('only Blackboard cookies survive session persistence', () => {
  const cookies = blackboardCookies([
    { name: 'BbRouter', value: 'ok', domain: 'aulavirtual.upc.edu.pe', path: '/' },
    { name: 'parent', value: 'ok', domain: '.upc.edu.pe', path: '/' },
    { name: 'ESTSAUTH', value: 'secret', domain: '.login.microsoftonline.com', path: '/' },
    { name: 'lookalike', value: 'bad', domain: 'evil-aulavirtual.upc.edu.pe', path: '/' },
  ]);
  assert.deepEqual(cookies.map((cookie) => cookie.name), ['BbRouter', 'parent']);
});

test('service URLs require TLS except on loopback development hosts', () => {
  assert.equal(secureServiceUrl('https://example.com/', 'SERVICE'), 'https://example.com');
  assert.equal(secureServiceUrl('http://127.0.0.1:8787/', 'SERVICE'), 'http://127.0.0.1:8787');
  assert.throws(() => secureServiceUrl('http://example.com', 'SERVICE'), /HTTPS/);
  assert.throws(() => secureServiceUrl('https://user:pass@example.com', 'SERVICE'), /credentials/);
});

test('MCP downloads stay under their configured root and never overwrite', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-download-test-'));
  const previous = process.env.CAMPUS_DOWNLOAD_DIR;
  process.env.CAMPUS_DOWNLOAD_DIR = root;
  t.after(() => {
    if (previous === undefined) delete process.env.CAMPUS_DOWNLOAD_DIR;
    else process.env.CAMPUS_DOWNLOAD_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  });

  assert.throws(() => resolveDownloadDir('/tmp/outside'), /must be relative/);
  assert.throws(() => resolveDownloadDir('../outside'), /outside/);
  assert.throws(() => resolveDownloadDir(`${DOWNLOAD_QUOTA_LOCK}/child`), /reserved/);
  assert.throws(() => resolveDownloadDir('.CAMPUS-DOWNLOAD-QUOTA.LOCK/child'), /reserved/);
  assert.throws(
    () => safeNewFilePath(root, '.file.123.12345678-1234-1234-1234-123456789abc.part'),
    /unsafe filename/,
  );
  assert.throws(
    () => safeNewFilePath(root, `${DOWNLOAD_QUOTA_LOCK}.reap-user-file`),
    /unsafe filename/,
  );
  assert.throws(
    () => safeNewFilePath(root, '.CAMPUS-DOWNLOAD-QUOTA.LOCK.REAP-user-file'),
    /unsafe filename/,
  );

  const dir = resolveDownloadDir('course');
  const destination = safeNewFilePath(dir, '../material.pdf');
  assert.equal(destination, path.join(dir, 'material.pdf'));
  assert.equal(await writeLimitedDownload(Readable.from(['hello']), destination, 10), 5);
  assert.equal(fs.readFileSync(destination, 'utf8'), 'hello');
  assert.throws(
    () => fs.openSync(destination, 'wx'),
    (error: NodeJS.ErrnoException) => error.code === 'EEXIST',
  );
});

test('oversized downloads are deleted instead of leaving partial files', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-limit-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const destination = path.join(root, 'large.bin');
  await assert.rejects(
    writeLimitedDownload(Readable.from([Buffer.alloc(8)]), destination, 4),
    /safety limit/,
  );
  assert.equal(fs.existsSync(destination), false);
});

test('download streams are destroyed when exclusive destination creation fails', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-stream-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const destination = path.join(root, 'existing.bin');
  fs.writeFileSync(destination, 'existing');
  const input = new PassThrough();

  await assert.rejects(
    writeLimitedDownload(input, destination),
    (error: NodeJS.ErrnoException) => error.code === 'EEXIST',
  );
  assert.equal(input.destroyed, true);
});

test('the final download name is published only after the stream completes', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-publish-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const destination = path.join(root, 'material.pdf');
  const input = new PassThrough();
  const download = writeLimitedDownload(input, destination, 20);

  input.write('partial');
  await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(fs.existsSync(destination), false);
  assert.equal(fs.readdirSync(root).some((name) => name.endsWith('.part')), true);

  input.end('-complete');
  assert.equal(await download, 16);
  assert.equal(fs.readFileSync(destination, 'utf8'), 'partial-complete');
  assert.equal(fs.readdirSync(root).some((name) => name.endsWith('.part')), false);
});

test('download streams are destroyed when response-derived filenames are unsafe', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-name-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const input = new PassThrough();

  await assert.rejects(writeNamedDownload(input, root, '..'), /unsafe filename/);
  assert.equal(input.destroyed, true);
});

test('the configured download root itself cannot be a symlink', (t) => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-root-link-test-'));
  const target = path.join(parent, 'target');
  const link = path.join(parent, 'downloads');
  fs.mkdirSync(target);
  fs.symlinkSync(target, link);
  const previous = process.env.CAMPUS_DOWNLOAD_DIR;
  process.env.CAMPUS_DOWNLOAD_DIR = link;
  t.after(() => {
    if (previous === undefined) delete process.env.CAMPUS_DOWNLOAD_DIR;
    else process.env.CAMPUS_DOWNLOAD_DIR = previous;
    fs.rmSync(parent, { recursive: true, force: true });
  });
  assert.throws(() => resolveDownloadDir(), /symbolic link/);
});

test('missing directories beneath symlinks are rejected before creation', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-parent-link-test-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-parent-target-'));
  fs.symlinkSync(outside, path.join(root, 'linked-outside'));
  const previous = process.env.CAMPUS_DOWNLOAD_DIR;
  process.env.CAMPUS_DOWNLOAD_DIR = root;
  t.after(() => {
    if (previous === undefined) delete process.env.CAMPUS_DOWNLOAD_DIR;
    else process.env.CAMPUS_DOWNLOAD_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  assert.throws(() => resolveDownloadDir('linked-outside/new'), /symlink/);
  assert.equal(fs.existsSync(path.join(outside, 'new')), false);
});

test('the download directory quota includes files already on disk', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-quota-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'existing.bin'), Buffer.alloc(3));
  const destination = path.join(root, 'new.bin');
  await assert.rejects(
    writeLimitedDownload(Readable.from([Buffer.alloc(2)]), destination, 10, { root, maxBytes: 4 }),
    /safety limit/,
  );
  assert.equal(fs.existsSync(destination), false);
});

test('abandoned private download files are reclaimed while holding the quota lock', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-part-cleanup-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const abandoned = path.join(
    root,
    '.material.pdf.123.12345678-1234-1234-1234-123456789abc.part',
  );
  fs.writeFileSync(abandoned, Buffer.alloc(10));
  const destination = path.join(root, 'new.bin');

  assert.equal(
    await writeLimitedDownload(Readable.from(['hello']), destination, 10, { root, maxBytes: 10 }),
    5,
  );
  assert.equal(fs.existsSync(abandoned), false);
});

test('nested reaper-prefixed user directories are preserved and counted', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-nested-reaper-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const nested = path.join(root, 'course', `${DOWNLOAD_QUOTA_LOCK}.reap-not-internal`);
  fs.mkdirSync(nested, { recursive: true });
  const existing = path.join(nested, 'material.bin');
  fs.writeFileSync(existing, Buffer.alloc(8));
  const destination = path.join(root, 'new.bin');

  await assert.rejects(
    writeLimitedDownload(Readable.from([Buffer.alloc(3)]), destination, 10, { root, maxBytes: 10 }),
    /safety limit/,
  );
  assert.equal(fs.existsSync(existing), true);
  assert.equal(fs.readFileSync(existing).byteLength, 8);
});

test('download quota waits for a filesystem lock shared with other processes', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-quota-lock-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const lockPath = path.join(root, DOWNLOAD_QUOTA_LOCK);
  fs.mkdirSync(lockPath);
  const destination = path.join(root, 'new.bin');
  let settled = false;
  const download = writeLimitedDownload(
    Readable.from(['hello']),
    destination,
    10,
    { root, maxBytes: 20 },
  ).finally(() => { settled = true; });

  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(settled, false);
  fs.rmdirSync(lockPath);
  assert.equal(await download, 5);
  assert.equal(fs.readFileSync(destination, 'utf8'), 'hello');
});

test('a replaced quota lock fences the old writer before final publication', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-quota-fence-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const destination = path.join(root, 'new.bin');
  const input = new PassThrough();
  const download = writeLimitedDownload(input, destination, 20, { root, maxBytes: 20 });
  const lockPath = path.join(root, DOWNLOAD_QUOTA_LOCK);

  for (let attempt = 0; attempt < 20 && !fs.existsSync(lockPath); attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(fs.existsSync(lockPath), true);
  fs.rmSync(lockPath, { recursive: true });
  fs.mkdirSync(lockPath);
  input.end('complete');

  await assert.rejects(download, /quota lock was replaced/);
  assert.equal(fs.existsSync(destination), false);
});
