import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, NightLine, ReadNight } from './types.js';

// A night is named by its date. Anything else never reaches the filesystem, so a `..` in the
// parameter can't read outside runsDir.
const NIGHT = /^\d{4}-\d{2}-\d{2}$/;

class MissingNightError extends Error {}

function isStatus(value: unknown): value is NightLine['status'] {
  return value === 'ok' || value === 'retry' || value === 'fail';
}

// The edge: one line of the log, certified. Past this the NightLine type is trusted. A line that
// isn't JSON, or is JSON but not a run line, comes back null — the caller counts it.
function asNightLine(text: string): NightLine | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;

  const { at, job, status, owner, error } = parsed as Record<string, unknown>;
  if (typeof at !== 'string' || typeof job !== 'string' || !isStatus(status)) return null;
  if (owner !== null && typeof owner !== 'string') return null;
  if (error !== undefined && typeof error !== 'string') return null;

  return typeof error === 'string'
    ? { at, job, status, owner, error }
    : { at, job, status, owner };
}

// runs/<night>.jsonl folded into one row per job. Rows are sorted by job so the page and the
// JSON can't disagree about order (ADR 0001); neither of them re-sorts. A night with no file
// throws — see isMissingNight.
export const readNight: ReadNight = (runsDir, night) => {
  if (!NIGHT.test(night)) throw new MissingNightError(`not a night: ${night}`);
  const text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');

  const byJob = new Map<string, DigestRow>();
  let badLines = 0;

  for (const raw of text.split(/\r?\n/)) {
    const trimmed = raw.trim();
    if (trimmed === '') continue;

    const line = asNightLine(trimmed);
    if (line === null) {
      badLines += 1;
      continue;
    }

    const row = byJob.get(line.job);
    if (row === undefined) {
      byJob.set(line.job, {
        job: line.job,
        owner: line.owner,
        runs: 1,
        retries: line.status === 'retry' ? 1 : 0,
        lastStatus: line.status,
        lastError: line.error ?? null,
        firstAt: line.at,
        lastAt: line.at,
      });
      continue;
    }

    row.runs += 1;
    if (line.status === 'retry') row.retries += 1;
    // The log is in order, so the last line seen for a job is the latest one.
    row.owner = line.owner;
    row.lastStatus = line.status;
    row.lastError = line.error ?? null;
    row.lastAt = line.at;
  }

  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { rows, badLines };
};

// True when the night has no file on disk, and when `night` isn't a date at all. The digest
// routes answer 404 on both; anything else is a real failure.
export function isMissingNight(err: unknown): boolean {
  if (err instanceof MissingNightError) return true;
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT';
}
