import 'dotenv/config';
import { createApp } from './server';
import { getEnv } from './config/env';
import { ensureDynamoTable } from './dev/ensureDynamoTable';

const env = getEnv();

const port = Number(env.PORT ?? '4000');

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
    } catch (err: unknown) {
      const { code, message } = getErrorCodeAndMessage(err);

      const isConnRefused =
        code === 'ECONNREFUSED' ||
        message.includes('ECONNREFUSED') ||
        message.toLowerCase().includes('connect');

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

type ErrorWithCode = {
  code?: string;
  name?: string;
  message?: string;
};

function getErrorCodeAndMessage(err: unknown): { code: string; message: string } {
  if (err && typeof err === 'object') {
    const e = err as ErrorWithCode;
    return {
      code: e.code ?? e.name ?? 'UNKNOWN',
      message: e.message ?? String(err),
    };
  }

  return {
    code: 'UNKNOWN',
    message: String(err),
  };
}

async function main() {
  const env = getEnv();

  const isLocalDynamo =
    !!env.DYNAMO_ENDPOINT &&
    (env.DYNAMO_ENDPOINT.includes('localhost') ||
      env.DYNAMO_ENDPOINT.includes('127.0.0.1') ||
      env.DYNAMO_ENDPOINT.includes('dynamodb-local'));

  if (env.NODE_ENV !== 'production' && isLocalDynamo) {
    await ensureDynamoWithRetry();
  }

  const app = createApp();

  app.listen(port, () => {
    console.log(
      JSON.stringify({
        msg: 'api:listening',
        port,
        env: env.NODE_ENV,
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
