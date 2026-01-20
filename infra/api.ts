// infra/api.ts
/// <reference path="../.sst/platform/config.d.ts" />

import { mainTable, xrayBucket } from './storage';
import { connectionsTable, realtimeWs } from './realtime';
import { jwtAccessSecret, jwtRefreshSecret } from './secrets';

export function createApi(router: sst.aws.Router) {
  const qzSecretId = process.env.QZ_PRIVATE_KEY_SECRET_ID ?? '';

  const apiFn = new sst.aws.Function('Api', {
    runtime: 'nodejs20.x',
    handler: 'apps/api/src/lambda.handler',

    nodejs: {
      install: ['bcrypt', 'sharp'],
    },

    link: [mainTable, xrayBucket, connectionsTable],

    permissions: [
      {
        actions: ['execute-api:ManageConnections'],
        resources: ['*'],
      },
      {
        actions: ['secretsmanager:GetSecretValue'],
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

      REALTIME_WS_URL: realtimeWs.url,
      REALTIME_WS_ENDPOINT: realtimeWs.managementEndpoint,

      // ✅ add this
      QZ_PRIVATE_KEY_SECRET_ID: qzSecretId,
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
