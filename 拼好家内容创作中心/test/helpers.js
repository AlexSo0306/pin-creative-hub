import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/db.js';

export async function createTestServer(options = {}) {
  const database = createDatabase({
    filename: ':memory:',
    seed: options.seed !== false
  });
  const app = createApp({ database });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');

  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    database,
    baseUrl,
    async close() {
      server.close();
      await once(server, 'close');
      database.close();
    }
  };
}
