import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { isMissingNight, readNight } from '../src/digest/read-night.js';
import type { DigestRow } from '../src/digest/types.js';

// runs/ is read-only (AGENTS.md), so the made-up nights get their own dir.
const tmpRuns = mkdtempSync(join(tmpdir(), 'rig-runs-'));

function writeNight(night: string, body: string): string {
  writeFileSync(join(tmpRuns, `${night}.jsonl`), body);
  return night;
}

function row(rows: DigestRow[], job: string): DigestRow {
  const found = rows.find((r) => r.job === job);
  if (found === undefined) throw new Error(`no row for ${job}`);
  return found;
}

afterAll(() => rmSync(tmpRuns, { recursive: true, force: true }));

describe('readNight', () => {
  it('folds 2026-10-28 into five jobs and counts the bad line', () => {
    const { rows, badLines } = readNight('runs', '2026-10-28');

    expect(rows.map((r) => r.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(badLines).toBe(1);
  });

  it('counts runs and retries, and takes status, error and owner from the last line', () => {
    const { rows } = readNight('runs', '2026-10-28');

    expect(row(rows, 'fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: null,
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(row(rows, 'lane/sync').retries).toBe(1);
    expect(row(rows, 'lane/sync').runs).toBe(8);
    expect(row(rows, 'notes/backup').lastStatus).toBe('fail');
    expect(row(rows, 'notes/backup').lastError).toBe('quota exceeded');
    expect(row(rows, 'digest/render').owner).toBe(null);
    expect(row(rows, 'rig/rotate-logs').lastError).toBe(null);
  });

  it('keeps the times as logged, offset and all', () => {
    const { rows } = readNight('runs', '2026-10-28');

    expect(row(rows, 'lane/sync').firstAt).toBe('2026-10-28T23:00:06+01:00');
    expect(row(rows, 'lane/sync').lastAt).toBe('2026-10-29T05:00:04+01:00');
  });

  it('reads 2026-10-27 with nothing wrong in it', () => {
    const { rows, badLines } = readNight('runs', '2026-10-27');

    expect(badLines).toBe(0);
    expect(rows.map((r) => r.job)).toEqual([
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(rows.every((r) => r.lastStatus === 'ok')).toBe(true);
    expect(rows.every((r) => r.retries === 0)).toBe(true);
  });

  it('reads an empty night as a night where nothing ran', () => {
    expect(readNight(tmpRuns, writeNight('2026-10-01', ''))).toEqual({ rows: [], badLines: 0 });
    expect(readNight(tmpRuns, writeNight('2026-10-02', '\n\n  \n'))).toEqual({ rows: [], badLines: 0 });
  });

  it('counts a line that is not a run line and still returns the night', () => {
    const night = writeNight(
      '2026-10-03',
      [
        '{"at":"2026-10-03T23:00:00+01:00","job":"lane/sync","status":"ok","owner":"rook"}',
        '{"at":"2026-10-03T23:30:00+01:00","job":"lane/sy',
        '{"at":"2026-10-03T23:40:00+01:00","status":"ok","owner":"rook"}',
        '{"at":"2026-10-03T23:50:00+01:00","job":"notes/backup","status":"skipped","owner":null}',
        '"just a string"',
        '{"at":"2026-10-04T00:00:00+01:00","job":"lane/sync","status":"fail","owner":"rook","error":"lock held"}',
        '',
      ].join('\n'),
    );

    const { rows, badLines } = readNight(tmpRuns, night);

    expect(badLines).toBe(4);
    expect(rows).toEqual([
      {
        job: 'lane/sync',
        owner: 'rook',
        runs: 2,
        retries: 0,
        lastStatus: 'fail',
        lastError: 'lock held',
        firstAt: '2026-10-03T23:00:00+01:00',
        lastAt: '2026-10-04T00:00:00+01:00',
      },
    ]);
  });

  it('does not invent a night with no file', () => {
    try {
      readNight(tmpRuns, '2026-09-30');
      expect.unreachable('a night with no file must throw');
    } catch (err) {
      expect(isMissingNight(err)).toBe(true);
    }
  });

  it('treats a night that is not a date as missing, without touching the disk', () => {
    for (const night of ['nope', '../2026-10-28', '2026-10-28.jsonl', '']) {
      try {
        readNight('runs', night);
        expect.unreachable(`${night} must throw`);
      } catch (err) {
        expect(isMissingNight(err)).toBe(true);
      }
    }
  });

  it('does not call a real failure a missing night', () => {
    expect(isMissingNight(new Error('boom'))).toBe(false);
    expect(isMissingNight(null)).toBe(false);
  });
});
