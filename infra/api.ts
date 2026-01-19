/// <reference path="../.sst/platform/config.d.ts" />

import { mainTable, xrayBucket } from './storage';
import { connectionsTable } from './realtime';

export function createApi(router: sst.aws.Router) {
  const jwtAccessSecret = new sst.Secret('JWT_ACCESS_SECRET');
  const jwtRefreshSecret = new sst.Secret('JWT_REFRESH_SECRET');

  const apiFn = new sst.aws.Function('Api', {
    runtime: 'nodejs20.x',

    handler: 'apps/api/src/lambda.handler',

    link: [mainTable, xrayBucket, connectionsTable],

    environment: {
      NODE_ENV: 'production',
      APP_REGION: 'us-east-1',

      DDB_TABLE_NAME: mainTable.name,
      XRAY_BUCKET_NAME: xrayBucket.name,
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
