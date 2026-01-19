/// <reference path="../.sst/platform/config.d.ts" />

import { mainTable, xrayBucket } from './storage';
import { connectionsTable } from './realtime';

export function createApi(router: sst.aws.Router) {
  const jwtAccessSecret = new sst.Secret('JWT_ACCESS_SECRET');
  const jwtRefreshSecret = new sst.Secret('JWT_REFRESH_SECRET');

  const apiFn = new sst.aws.Function('Api', {
    handler: 'apps/api/src/lambda.handler',
    link: [mainTable, xrayBucket, connectionsTable],
    environment: {
      NODE_ENV: 'production',
      APP_REGION: 'us-east-1',

      // ✅ IMPORTANT: In AWS, do NOT set custom endpoints at all.
      // Leaving these undefined avoids zod min(1) validation failures.
      // DYNAMO_ENDPOINT: undefined,
      // S3_ENDPOINT: undefined,
      // S3_PUBLIC_ENDPOINT: undefined,

      DDB_TABLE_NAME: mainTable.name,
      XRAY_BUCKET_NAME: xrayBucket.name,

      // used by realtime handlers / publishers too
      DDB_CONNECTIONS_TABLE: connectionsTable.name,

      JWT_ACCESS_SECRET: jwtAccessSecret.value,
      JWT_REFRESH_SECRET: jwtRefreshSecret.value,
    },

    url: {
      router: {
        instance: router,
        path: '/api',
      },
    },
  });

  return apiFn;
}
