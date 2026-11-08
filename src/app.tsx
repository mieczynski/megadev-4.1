import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { isMissingNight, readNight } from './digest/read-night.js';
import type { NightDigest } from './digest/types.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { DigestTable } from './views/digest.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', (c) =>
    c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={readStatus(config)} />
      </Layout>,
    ),
  );

  app.get('/digest/:night', (c) => {
    const night = c.req.param('night');
    let digest: NightDigest;
    try {
      digest = readNight(config.runsDir, night);
    } catch (err) {
      if (isMissingNight(err)) return c.notFound();
      throw err;
    }
    return c.html(
      <Layout title={`digest · ${night}`} lane={lane()}>
        <DigestTable night={night} digest={digest} />
      </Layout>,
    );
  });

  return app;
}
