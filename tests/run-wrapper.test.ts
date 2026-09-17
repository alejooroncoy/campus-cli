import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

test('run wrapper exits non-zero when the TypeScript runner cannot launch', () => {
  const fixtureDir = mkdtempSync(join(tmpdir(), 'campus-run-wrapper-'));

  try {
    copyFileSync('run.js', join(fixtureDir, 'run.js'));

    const result = spawnSync(process.execPath, ['run.js', '--help'], {
      cwd: fixtureDir,
      encoding: 'utf8',
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /spawnSync .*tsx.*ENOENT/);
  } finally {
    rmSync(fixtureDir, { recursive: true, force: true });
  }
});
