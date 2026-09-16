import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Transform, type Readable } from 'node:stream';
import lockfile from 'proper-lockfile';

export const MAX_DOWNLOAD_BYTES = 100 * 1024 * 1024;
export const MAX_DOWNLOAD_ROOT_BYTES = 500 * 1024 * 1024;
export const DOWNLOAD_QUOTA_LOCK = '.campus-download-quota.lock';
export const DOWNLOAD_QUOTA_OWNER = 'owner';
const DOWNLOAD_QUOTA_REAP_PREFIX = `${DOWNLOAD_QUOTA_LOCK}.reap-`;
const PRIVATE_PART_PATTERN = /^\..+\.\d+\.[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.part$/i;

// proper-lockfile uses an atomic mkdir. Claim a specific lock generation by
// renaming its directory before deleting anything inside it; this prevents a
// delayed cleanup from unlinking files in a successor generation.
const quotaLockFs: any = Object.create(fs);
quotaLockFs.rmdir = (target: string, callback: (error?: NodeJS.ErrnoException | null) => void) => {
  if (path.basename(target) !== DOWNLOAD_QUOTA_LOCK) {
    callback(Object.assign(new Error(`Refusing to remove unexpected lock path: ${target}`), {
      code: 'EINVAL',
    }));
    return;
  }
  const claimed = `${target}.reap-${randomUUID()}`;
  try {
    fs.renameSync(target, claimed);
    fs.rmSync(claimed, { recursive: true });
    callback(null);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') callback(null);
    else callback(error as NodeJS.ErrnoException);
  }
};

export function downloadRoot(): string {
  return path.resolve(
    process.env.CAMPUS_DOWNLOAD_DIR ?? path.join(os.homedir(), 'Downloads', 'campus-cli'),
  );
}

function isInside(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
}

/**
 * MCP callers may choose a subdirectory, but never an arbitrary location on the
 * machine. The root itself is controlled by the person who launches Campus via
 * CAMPUS_DOWNLOAD_DIR, not by course content or a tool-calling model.
 */
export function resolveDownloadDir(subdirectory?: string): string {
  const root = downloadRoot();
  if (subdirectory && path.isAbsolute(subdirectory)) {
    throw new Error(`outputDir must be relative to the Campus download directory: ${root}`);
  }

  if (fs.existsSync(root) && fs.lstatSync(root).isSymbolicLink()) {
    throw new Error(`Refusing to use a symbolic link as the Campus download directory: ${root}`);
  }
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  fs.chmodSync(root, 0o700);

  const requested = path.resolve(root, subdirectory ?? '.');
  if (!isInside(root, requested)) {
    throw new Error(`Refusing to write outside the Campus download directory: ${root}`);
  }
  const realRoot = fs.realpathSync(root);
  let current = realRoot;
  const relativeParts = path.relative(root, requested).split(path.sep).filter(Boolean);
  const firstPart = relativeParts[0]?.toLowerCase();
  if (
    firstPart === DOWNLOAD_QUOTA_LOCK
    || firstPart?.startsWith(DOWNLOAD_QUOTA_REAP_PREFIX)
  ) {
    throw new Error(`outputDir uses the reserved Campus quota lock name: ${DOWNLOAD_QUOTA_LOCK}`);
  }
  for (const part of relativeParts) {
    const next = path.join(current, part);
    try {
      fs.mkdirSync(next, { mode: 0o700 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }

    const stat = fs.lstatSync(next);
    if (stat.isSymbolicLink()) {
      throw new Error(`Refusing to follow an output directory symlink: ${next}`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`Download output path is not a directory: ${next}`);
    }
    current = fs.realpathSync(next);
    if (!isInside(realRoot, current)) {
      throw new Error(`Refusing to follow an output directory outside: ${realRoot}`);
    }
    fs.chmodSync(current, 0o700);
  }
  return current;
}

export function safeNewFilePath(dir: string, name: string): string {
  const base = path.basename(name);
  const normalizedBase = base.toLowerCase();
  if (
    !base
    || base === '.'
    || base === '..'
    || normalizedBase === DOWNLOAD_QUOTA_LOCK
    || normalizedBase.startsWith(DOWNLOAD_QUOTA_REAP_PREFIX)
    || PRIVATE_PART_PATTERN.test(base)
  ) {
    throw new Error(`Refusing to write an unsafe filename: ${name}`);
  }
  return path.join(dir, base);
}

function treeBytes(directory: string, ignoredPath?: string, isRoot = true): number {
  let total = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const normalizedName = entry.name.toLowerCase();
    if (
      isRoot
      && (
        normalizedName === DOWNLOAD_QUOTA_LOCK
        || normalizedName.startsWith(DOWNLOAD_QUOTA_REAP_PREFIX)
      )
    ) {
      continue;
    }
    const item = path.join(directory, entry.name);
    if (item === ignoredPath) continue;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) total += treeBytes(item, ignoredPath, false);
    else if (entry.isFile()) total += fs.statSync(item).size;
    if (total > MAX_DOWNLOAD_ROOT_BYTES) break;
  }
  return total;
}

function cleanupAbandonedDownloadFiles(directory: string, isRoot = true): void {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const normalizedName = entry.name.toLowerCase();
    if (isRoot && normalizedName === DOWNLOAD_QUOTA_LOCK) continue;
    const item = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (isRoot && normalizedName.startsWith(DOWNLOAD_QUOTA_REAP_PREFIX)) {
        fs.rmSync(item, { recursive: true });
      } else {
        cleanupAbandonedDownloadFiles(item, false);
      }
    } else if (entry.isFile() && PRIVATE_PART_PATTERN.test(entry.name)) {
      fs.unlinkSync(item);
    }
  }
}

async function acquireQuotaLock(root: string): Promise<{
  assertOwned: () => void;
  release: () => Promise<void>;
}> {
  const lockPath = path.join(root, DOWNLOAD_QUOTA_LOCK);
  const ownerPath = path.join(lockPath, DOWNLOAD_QUOTA_OWNER);
  const token = randomUUID();
  let compromised: Error | undefined;
  const release = await lockfile.lock(root, {
    lockfilePath: lockPath,
    realpath: true,
    fs: quotaLockFs,
    stale: 5_000,
    update: 1_000,
    retries: { forever: true, minTimeout: 50, maxTimeout: 250, randomize: true },
    onCompromised: (error) => { compromised = error; },
  });
  try {
    const lockStat = fs.statSync(lockPath);
    fs.writeFileSync(ownerPath, token, { flag: 'wx', mode: 0o600 });
    // Creating the token changes the directory mtime. Restore the exact mtime
    // proper-lockfile recorded so its heartbeat does not report compromise.
    fs.utimesSync(lockPath, lockStat.atime, lockStat.mtime);
  } catch (error) {
    await release();
    throw error;
  }
  const ownershipError = () => Object.assign(
    new Error('Campus download quota lock was replaced'),
    { code: 'ECOMPROMISED' },
  );
  const stillOwnsLock = () => {
    try {
      return fs.readFileSync(ownerPath, 'utf8') === token;
    } catch {
      return false;
    }
  };
  return {
    assertOwned: () => {
      if (compromised) throw compromised;
      if (!stillOwnsLock()) {
        compromised = ownershipError();
        throw compromised;
      }
    },
    release: async () => {
      if (compromised || !stillOwnsLock()) {
        compromised ??= ownershipError();
        return;
      }
      try {
        await release();
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ERELEASED') throw error;
      }
    },
  };
}

function assertDestinationAbsent(destination: string): void {
  try {
    fs.lstatSync(destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  throw Object.assign(new Error(`Download destination already exists: ${destination}`), {
    code: 'EEXIST',
  });
}

function createPrivateTemporaryFile(destination: string): { path: string; fd: number } {
  const directory = path.dirname(destination);
  const basename = path.basename(destination);
  while (true) {
    const candidate = path.join(directory, `.${basename}.${process.pid}.${randomUUID()}.part`);
    try {
      const fd = fs.openSync(candidate, 'wx', 0o600);
      return { path: candidate, fd };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
}

/** Write a response stream once, without following symlinks or overwriting. */
export async function writeLimitedDownload(
  input: Readable,
  destination: string,
  maxBytes = MAX_DOWNLOAD_BYTES,
  quota?: { root: string; maxBytes?: number },
): Promise<number> {
  let quotaLock: Awaited<ReturnType<typeof acquireQuotaLock>> | undefined;
  let quotaRoot: string | undefined;
  let quotaLimit: number | undefined;
  let temporary: string | undefined;
  let fd: number;
  try {
    if (quota) {
      quotaRoot = fs.realpathSync(quota.root);
      quotaLimit = quota.maxBytes ?? MAX_DOWNLOAD_ROOT_BYTES;
      const canonicalDestination = path.join(
        fs.realpathSync(path.dirname(destination)),
        path.basename(destination),
      );
      if (!isInside(quotaRoot, canonicalDestination)) {
        throw new Error(`Download destination is outside its quota root: ${quotaRoot}`);
      }
      quotaLock = await acquireQuotaLock(quotaRoot);
      cleanupAbandonedDownloadFiles(quotaRoot);
      const available = quotaLimit - treeBytes(quotaRoot);
      const allowedBytes = Math.min(maxBytes, Math.max(0, available));
      if (allowedBytes <= 0) {
        throw new Error(`Campus download directory reached its ${quotaLimit}-byte quota`);
      }
      maxBytes = allowedBytes;
    }

    assertDestinationAbsent(destination);
    const temporaryFile = createPrivateTemporaryFile(destination);
    temporary = temporaryFile.path;
    fd = temporaryFile.fd;
  } catch (error) {
    if (temporary) try { fs.unlinkSync(temporary); } catch {}
    try { await quotaLock?.release(); } catch {}
    input.destroy();
    throw error;
  }
  let bytes = 0;
  const limiter = new Transform({
    transform(chunk: Buffer | string, encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
      bytes += buffer.byteLength;
      if (bytes > maxBytes) {
        callback(new Error(`Download exceeds the ${maxBytes}-byte safety limit`));
        return;
      }
      callback(null, buffer);
    },
  });

  try {
    await pipeline(input, limiter, fs.createWriteStream(temporary, { fd, autoClose: true }));
    quotaLock?.assertOwned();
    if (quotaRoot !== undefined && quotaLimit !== undefined) {
      const committedBytes = treeBytes(quotaRoot, temporary);
      if (committedBytes + bytes > quotaLimit) {
        throw new Error(`Campus download directory reached its ${quotaLimit}-byte quota`);
      }
    }
    quotaLock?.assertOwned();

    // Hard-linking is an atomic, exclusive publish on the same filesystem. A
    // crash before this point leaves only the private .part file, never a
    // truncated file under the requested final name.
    const publishedTemporary = temporary;
    fs.linkSync(publishedTemporary, destination);
    temporary = undefined;
    try { fs.unlinkSync(publishedTemporary); } catch {}
    return bytes;
  } catch (error) {
    try { fs.closeSync(fd); } catch {}
    if (temporary) try { fs.unlinkSync(temporary); } catch {}
    throw error;
  } finally {
    await quotaLock?.release();
  }
}

/** Resolve the final filename and guarantee that setup failures close the input stream. */
export async function writeNamedDownload(
  input: Readable,
  directory: string,
  name: string,
  maxBytes = MAX_DOWNLOAD_BYTES,
  quota?: { root: string; maxBytes?: number },
): Promise<{ destination: string; size: number }> {
  try {
    const destination = safeNewFilePath(directory, name);
    const size = await writeLimitedDownload(input, destination, maxBytes, quota);
    return { destination, size };
  } catch (error) {
    input.destroy();
    throw error;
  }
}
