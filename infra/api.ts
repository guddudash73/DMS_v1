/// <reference path="../.sst/platform/config.d.ts" />

import { mainTable, xrayBucket } from './storage';
import { connectionsTable, realtimeWs } from './realtime';
import { jwtAccessSecret, jwtRefreshSecret } from './secrets';

export function createApi(router: sst.aws.Router) {
  const apiFn = new sst.aws.Function('Api', {
    runtime: 'nodejs20.x',
    handler: 'apps/api/src/lambda.handler',

    /**
     * ✅ PRODUCTION FIX: native dependency packaging
     * sharp is a native module and must be installed into the Lambda bundle.
     * Without this, the runtime bundle.mjs will import "sharp" but it won't exist in /var/task/node_modules.
     */
    nodejs: {
      install: ['sharp'],
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

      // Optional: useful if you later want an API endpoint to return it
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
