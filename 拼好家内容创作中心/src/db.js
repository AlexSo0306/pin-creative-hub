import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { seedDatabase } from './seed.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultPath = path.resolve(dirname, '..', 'data', 'workbench.db');

export function createDatabase(options = {}) {
  const filename = options.filename || process.env.DB_PATH || defaultPath;

  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }

  const database = new DatabaseSync(filename);
  const schema = fs.readFileSync(path.join(dirname, 'schema.sql'), 'utf8');
  database.exec(schema);

  if (options.seed !== false) {
    seedDatabase(database);
  }

  return database;
}
