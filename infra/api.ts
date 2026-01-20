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

    // ✅ Key fix: make pdfkit a real node_module (so its /data/*.afm files exist)
    nodejs: {
      install: ['bcrypt', 'sharp', 'pdfkit'],
    },

    // ✅ Copy our own fonts into the Lambda package so we can use TTFs reliably
    copyFiles: [
      {
        from: 'apps/api/src/assets/fonts',
        to: 'assets/fonts',
      },
      { from: 'node_modules/pdfkit/js/data', to: 'data' },
    ],

    link: [mainTable, xrayBucket, connectionsTable],

    permissions: [
      { actions: ['execute-api:ManageConnections'], resources: ['*'] },
      { actions: ['secretsmanager:GetSecretValue'], resources: ['*'] },
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

      QZ_PRIVATE_KEY_SECRET_ID: qzSecretId,
    },

    url: {
      router: { instance: router, path: '/api' },
    },
  });

  return apiFn;
}
