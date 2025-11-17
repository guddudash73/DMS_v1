import 'dotenv/config';
import { createApp } from './server';
import { env, NODE_ENV, PORT, DYNAMO_ENDPOINT } from './config/env';
import { ensureDynamoTable } from './dev/ensureDynamoTable';

const port = Number(PORT ?? '4000');

async function main() {
  const isLocalDynamo =
    DYNAMO_ENDPOINT.includes('localhost') || DYNAMO_ENDPOINT.includes('127.0.0.1');

  if (NODE_ENV !== 'production' && isLocalDynamo) {
    await ensureDynamoTable();
  }

  const app = createApp();

  app.listen(port, () => {
    console.log(
      JSON.stringify({
        msg: 'api:listening',
        port,
        env: NODE_ENV,
        table: env.DDB_TABLE_NAME,
      }),
    );
  });
}

main().catch((err) => {
  console.error(
    JSON.stringify(
      {
        msg: 'api:startup-error',
        error:
          err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err,
      },
      null,
      2,
    ),
  );
  process.exit(1);
});
