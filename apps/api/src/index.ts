import 'dotenv/config';
import { createApp } from './server';
import { env, NODE_ENV, PORT, DYNAMO_ENDPOINT } from './config/env';
import { ensureDynamoTable } from './dev/ensureDynamoTable';

const port = Number(PORT ?? '4000');

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function ensureDynamoWithRetry() {
  const maxRetries = 10;
  const delayMs = 1000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        JSON.stringify({
          msg: 'dynamo:ensure_table_attempt',
          attempt,
        }),
      );
      await ensureDynamoTable();
      console.log(
        JSON.stringify({
          msg: 'dynamo:ensure_table_success',
          attempt,
        }),
      );
      return;
    } catch (err: any) {
      const code = err?.code ?? err?.name;
      const message = err?.message ?? String(err);

      const isConnRefused =
        code === 'ECONNREFUSED' || message.includes('ECONNREFUSED') || message.includes('connect');

      if (!isConnRefused || attempt === maxRetries) {
        console.error(
          JSON.stringify({
            msg: 'dynamo:ensure_table_failed',
            attempt,
            code,
            message,
          }),
        );
        throw err;
      }

      console.log(
        JSON.stringify({
          msg: 'dynamo:ensure_table_retry',
          attempt,
          delayMs,
          code,
          message,
        }),
      );
      await sleep(delayMs);
    }
  }
}

async function main() {
  const isLocalDynamo =
    DYNAMO_ENDPOINT.includes('localhost') ||
    DYNAMO_ENDPOINT.includes('127.0.0.1') ||
    DYNAMO_ENDPOINT.includes('dynamodb-local');

  if (NODE_ENV !== 'production' && isLocalDynamo) {
    await ensureDynamoWithRetry();
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
