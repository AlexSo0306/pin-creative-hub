import assert from 'node:assert/strict';
import test from 'node:test';
import { createDatabase } from '../src/db.js';

test('database schema can be initialized repeatedly', () => {
  const database = createDatabase({ filename: ':memory:' });

  assert.equal(
    database.prepare('SELECT COUNT(*) AS count FROM workspaces').get().count,
    1
  );
  assert.equal(
    database.prepare('SELECT COUNT(*) AS count FROM owned_accounts').get().count,
    3
  );
  assert.equal(
    database.prepare('SELECT COUNT(*) AS count FROM content_cards').get().count,
    8
  );
  assert.equal(
    database.prepare('SELECT COUNT(*) AS count FROM content_publish_records').get().count,
    24
  );

  database.close();
});
