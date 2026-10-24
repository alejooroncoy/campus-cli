import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

test('the download tool rejects relative non-file paths before transport and accepts UPN files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'campus-download-origin-'));
  try {
    // Isolate session storage in a child process; never read a real student session.
    const script = `
      require('node:os').homedir = () => process.env.CAMPUS_TEST_STATE_ROOT;
      const assert = require('node:assert/strict');
      const { Readable } = require('node:stream');
      const axios = require('axios');
      const urls = [];
      axios.defaults.adapter = async config => {
        urls.push(config.url);
        return { config, data: Readable.from(['fixture']), status: 200, statusText: 'OK', headers: { 'content-type': 'text/plain' } };
      };
      const { saveSession } = require('./src/providers/blackboard/auth/session.ts');
      saveSession({ universityId: 'upn-pe', cookies: [{ name: 'JSESSIONID', value: 'fixture', domain: 'upn.blackboard.com', path: '/' }], xsrfToken: '', expiresAt: Date.now() + 60000 });
      const handlers = new Map();
      require('./src/providers/blackboard/mcp-tools.ts').registerBlackboardTools({
        registerTool(name, ...parts) { handlers.set(name, parts.at(-1)); }, server: {},
      });
      (async () => {
        const download = handlers.get('blackboard_download_file_url');
        for (const url of ['/learn/api/public/v1/users/me', '/webapps/portal/', '//upn.blackboard.com/webapps/portal/']) {
          await assert.rejects(download({ url }), /Direct downloads are restricted/);
        }
        await assert.rejects(download({ url: 'https://aulavirtual.upc.edu.pe/bbcswebdav/file' }), /non-Blackboard host/);
        assert.deepEqual(urls, []);
        await download({ url: '/bbcswebdav/xid-relative', filename: 'relative.txt' });
        await download({ url: 'https://upn.blackboard.com/bbcswebdav/xid-absolute', filename: 'absolute.txt' });
        assert.deepEqual(urls, ['/bbcswebdav/xid-relative', 'https://upn.blackboard.com/bbcswebdav/xid-absolute']);
      })().catch(error => { console.error(error); process.exitCode = 1; });
    `;
    execFileSync(process.execPath, [require.resolve('tsx/cli'), '--eval', script], {
      cwd: path.resolve(__dirname, '..'),
      env: { ...process.env, CAMPUS_TEST_STATE_ROOT: root, CAMPUS_DOWNLOAD_DIR: path.join(root, 'downloads'), POSTHOG_DISABLED: '1' },
      stdio: 'pipe',
    });
    assert.equal(fs.readFileSync(path.join(root, 'downloads', 'relative.txt'), 'utf8'), 'fixture');
    assert.equal(fs.readFileSync(path.join(root, 'downloads', 'absolute.txt'), 'utf8'), 'fixture');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
