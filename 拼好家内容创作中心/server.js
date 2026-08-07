import { createApp } from './src/app.js';
import { createDatabase } from './src/db.js';

const port = Number(process.env.PORT || 4174);
const database = createDatabase();
const app = createApp({ database });

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`拼好家运营创作中心已启动：http://localhost:${port}`);
});

function shutdown() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
