import assert from 'node:assert/strict';
import test from 'node:test';
import { createTestServer } from './helpers.js';

const validAccount = {
  name: '测试账号',
  direction: '测试方向',
  status: 'active',
  color: '#8B5CF6',
  positioning: '用于验证 API',
  targetAudience: '测试用户',
  cta: '立即测试',
  platforms: [
    {
      platform: 'douyin',
      username: 'test-account',
      profileUrl: 'https://www.douyin.com/user/test',
      publishStatus: 'active'
    }
  ]
};

test('owned account CRUD persists and validates data', async (context) => {
  const server = await createTestServer();
  context.after(() => server.close());

  const listResponse = await fetch(`${server.baseUrl}/api/owned-accounts`);
  const initial = await listResponse.json();
  assert.equal(initial.data.length, 3);

  const createResponse = await fetch(`${server.baseUrl}/api/owned-accounts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(validAccount)
  });
  const created = await createResponse.json();

  assert.equal(createResponse.status, 201);
  assert.equal(created.data.name, validAccount.name);
  assert.equal(created.data.platforms.length, 3);

  const duplicateResponse = await fetch(`${server.baseUrl}/api/owned-accounts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(validAccount)
  });
  const duplicate = await duplicateResponse.json();

  assert.equal(duplicateResponse.status, 422);
  assert.equal(duplicate.error.details.name, '该账号名称已存在');

  const updateResponse = await fetch(
    `${server.baseUrl}/api/owned-accounts/${created.data.id}`,
    {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...validAccount, direction: '更新后的方向' })
    }
  );
  const updated = await updateResponse.json();
  assert.equal(updated.data.direction, '更新后的方向');

  const deleteResponse = await fetch(
    `${server.baseUrl}/api/owned-accounts/${created.data.id}`,
    { method: 'DELETE' }
  );
  assert.equal(deleteResponse.status, 204);

  const finalResponse = await fetch(`${server.baseUrl}/api/owned-accounts`);
  const finalList = await finalResponse.json();
  assert.equal(finalList.data.length, 3);
});
