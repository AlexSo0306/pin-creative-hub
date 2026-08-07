import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestServer } from './helpers.js';

test('health endpoint reports a running service', async (context) => {
  const server = await createTestServer();
  context.after(() => server.close());

  const response = await fetch(`${server.baseUrl}/api/health`);
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.service, 'pinhaojia-content-workbench');
});
