// infra/api.ts
/// <reference path="../.sst/platform/config.d.ts" />

import { mainTable, xrayBucket } from './storage';
import { connectionsTable, realtimeWs } from './realtime';
import { jwtAccessSecret, jwtRefreshSecret } from './secrets';

export function createApi(router: sst.aws.Router) {
  const apiFn = new sst.aws.Function('Api', {
    runtime: 'nodejs20.x',
    handler: 'apps/api/src/lambda.handler',

    nodejs: {
      install: ['bcrypt', 'sharp'],
    },

    link: [mainTable, xrayBucket, connectionsTable],

    // ✅ REQUIRED so REST API lambdas can PostToConnection
    // TEMP: wildcard to avoid ARN mistakes; tighten after we confirm it works.
    permissions: [
      {
        actions: ['execute-api:ManageConnections'],
        resources: ['*'],
      },
    ],

    environment: {
      NODE_ENV: 'production',
      APP_REGION: 'us-east-1',

      DDB_TABLE_NAME: mainTable.name,
      XRAY_BUCKET_NAME: xrayBucket.name,
      DDB_CONNECTIONS_TABLE: connectionsTable.name,

      JWT_ACCESS_SECRET: jwtAccessSecret.value,
      JWT_REFRESH_SECRET: jwtRefreshSecret.value,

      // Browser-facing WS URL (ok to keep)
      REALTIME_WS_URL: realtimeWs.url,

      // ✅ Backend SDK-facing management endpoint (this is what wsClient.ts needs)
      REALTIME_WS_ENDPOINT: realtimeWs.managementEndpoint,
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
