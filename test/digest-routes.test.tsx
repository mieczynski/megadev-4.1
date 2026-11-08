import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { NightDigest } from '../src/digest/types.js';

// runs/ is read-only (AGENTS.md), so test nights get their own dir.
const tmpRuns = mkdtempSync(join(tmpdir(), 'rig-'));

function writeNight(night: string, body: string): string {
  writeFileSync(join(tmpRuns, `${night}.jsonl`), body);
  return night;
}

const config = { adapter: 'shim', installed: '2026-11-08T14:00:00+01:00', beatEverySeconds: 60, runsDir: tmpRuns };

afterAll(() => rmSync(tmpRuns, { recursive: true, force: true }));

describe('digest routes', () => {
  describe('a night that exists', () => {
    const night = writeNight(
      '2026-11-08',
      [
        '{"at":"2026-11-08T01:00:00+01:00","job":"job-a","status":"ok","owner":"alice"}',
        '{"at":"2026-11-08T02:00:00+01:00","job":"job-b","status":"ok","owner":"bob"}',
        '{"at":"2026-11-08T03:00:00+01:00","job":"job-c","status":"fail","owner":null}',
      ].join('\n'),
    );

    it('GET /digest/:night returns 200 and contains job names', async () => {
      const res = await createApp(config).request(`/digest/${night}`);
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain('job-a');
      expect(html).toContain('job-b');
      expect(html).toContain('job-c');
    });

    it('GET /api/digest/:night returns 200 with same jobs in same order', async () => {
      const res = await createApp(config).request(`/api/digest/${night}`);
      const digest: NightDigest = await res.json();
      expect(res.status).toBe(200);
      expect(digest.rows).toHaveLength(3);
      expect(digest.rows.map((r) => r.job)).toEqual(['job-a', 'job-b', 'job-c']);
      expect(digest.badLines).toBe(0);
    });
  });

  describe('a night with no file', () => {
    it('GET /digest/:night returns 404', async () => {
      const res = await createApp(config).request('/digest/2026-09-01');
      expect(res.status).toBe(404);
    });

    it('GET /api/digest/:night returns 404', async () => {
      const res = await createApp(config).request('/api/digest/2026-09-01');
      expect(res.status).toBe(404);
    });
  });

  describe('an empty night', () => {
    const night = writeNight('2026-11-07', '');

    it('GET /digest/:night returns 200 and says nothing ran', async () => {
      const res = await createApp(config).request(`/digest/${night}`);
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain('nothing ran');
    });

    it('GET /api/digest/:night returns 200 with no rows and badLines 0', async () => {
      const res = await createApp(config).request(`/api/digest/${night}`);
      const digest: NightDigest = await res.json();
      expect(res.status).toBe(200);
      expect(digest.rows).toHaveLength(0);
      expect(digest.badLines).toBe(0);
    });
  });

  describe('a night with a line that does not parse', () => {
    const night = writeNight(
      '2026-11-06',
      [
        '{"at":"2026-11-06T01:00:00+01:00","job":"job-x","status":"ok","owner":"charlie"}',
        'this is not a valid line',
        '{"at":"2026-11-06T02:00:00+01:00","job":"job-y","status":"ok","owner":"dave"}',
      ].join('\n'),
    );

    it('GET /digest/:night returns 200 and says a line did not parse', async () => {
      const res = await createApp(config).request(`/digest/${night}`);
      const html = await res.text();
      expect(res.status).toBe(200);
      expect(html).toContain('1 line did not parse');
    });

    it('GET /api/digest/:night returns 200 with badLines 1', async () => {
      const res = await createApp(config).request(`/api/digest/${night}`);
      const digest: NightDigest = await res.json();
      expect(res.status).toBe(200);
      expect(digest.rows).toHaveLength(2);
      expect(digest.badLines).toBe(1);
    });
  });
});
