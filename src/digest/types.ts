// One line of runs/<night>.jsonl, as logged. Offset kept as-is, never converted to UTC.
export type NightLine = {
  at: string;
  job: string;
  status: 'ok' | 'retry' | 'fail';
  owner: string | null;
  error?: string;
};

// One row per job, folded from a night's lines.
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: 'ok' | 'retry' | 'fail';
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

// One count per line by its status, for the night as a whole.
export type NightCounts = { ok: number; retry: number; fail: number };

// readNight's result: the rows plus a count of lines that didn't parse.
export type NightDigest = {
  rows: DigestRow[];
  badLines: number;
  counts: NightCounts;
};

export type ReadNight = (runsDir: string, night: string) => NightDigest;
