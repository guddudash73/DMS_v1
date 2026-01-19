/// <reference path="../.sst/platform/config.d.ts" />

import { mainTable, xrayBucket } from './storage';
import { connectionsTable, realtimeWs } from './realtime';
import { jwtAccessSecret, jwtRefreshSecret } from './secrets';

export function createApi(router: sst.aws.Router) {
  const apiFn = new sst.aws.Function('Api', {
    runtime: 'nodejs20.x',
    handler: 'apps/api/src/lambda.handler',

    /**
     * ✅ PRODUCTION FIX: native dependency packaging for Lambda
     *
     * Native modules like bcrypt + sharp require a platform-specific .node binary.
     * When esbuild bundles your handler, those binaries may not be included.
     *
     * `nodejs.install` forces SST to run an install step inside the Lambda bundle
     * so the correct Linux x64 Node 20 binaries are present at /var/task/node_modules.
     */
    nodejs: {
      install: ['bcrypt', 'sharp'],
    },

    link: [mainTable, xrayBucket, connectionsTable],

    environment: {
      NODE_ENV: 'production',
      APP_REGION: 'us-east-1',

      DDB_TABLE_NAME: mainTable.name,
      XRAY_BUCKET_NAME: xrayBucket.name,
      DDB_CONNECTIONS_TABLE: connectionsTable.name,

      JWT_ACCESS_SECRET: jwtAccessSecret.value,
      JWT_REFRESH_SECRET: jwtRefreshSecret.value,

      REALTIME_WS_URL: realtimeWs.url,
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
