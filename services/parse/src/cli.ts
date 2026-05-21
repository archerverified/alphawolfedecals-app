// Subprocess helpers for the CLI converters (Inkscape, pdf2svg). Temp-file based:
// most vector CLIs read/write files, not stdio.

import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cliExistsCache = new Map<string, boolean>();

// Cheap PATH probe, memoised. Drives the `queued_missing_cli` status so the
// editor shows "waiting on dependency" instead of crashing when Inkscape/pdf2svg
// aren't installed (e.g. CI).
export async function commandExists(cmd: string): Promise<boolean> {
  const cached = cliExistsCache.get(cmd);
  if (cached !== undefined) return cached;
  const exists = await new Promise<boolean>((resolve) => {
    const probe = spawn(process.platform === 'win32' ? 'where' : 'which', [cmd]);
    probe.on('error', () => resolve(false));
    probe.on('close', (code) => resolve(code === 0));
  });
  cliExistsCache.set(cmd, exists);
  return exists;
}

function exec(cmd: string, args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${cmd} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(0, 500)}`));
    });
  });
}

// Write `input` to a temp file, run `cmd` against it via `buildArgs(inPath, outPath)`,
// return the bytes the CLI wrote to outPath. Cleans up the temp dir unconditionally.
export async function convertViaCli(opts: {
  cmd: string;
  input: Buffer;
  inExt: string;
  outExt: string;
  buildArgs: (inPath: string, outPath: string) => string[];
  timeoutMs?: number;
}): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), 'awparse-'));
  const inPath = join(dir, `in.${opts.inExt}`);
  const outPath = join(dir, `out.${opts.outExt}`);
  try {
    await writeFile(inPath, opts.input);
    await exec(opts.cmd, opts.buildArgs(inPath, outPath), opts.timeoutMs ?? 60_000);
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
