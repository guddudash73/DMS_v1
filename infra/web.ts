/// <reference path="../.sst/platform/config.d.ts" />

import { realtimeWs } from './realtime';

export function createWeb(router: sst.aws.Router) {
  const qzSecretId = process.env.QZ_PRIVATE_KEY_SECRET_ID ?? '';

  const web = new sst.aws.Nextjs('Web', {
    path: 'apps/web',
    router: {
      instance: router,
    },

    environment: {
      // same-origin API via Router -> /api
      NEXT_PUBLIC_API_BASE_URL: '/api',

      // Your client helper appends "/$default" if missing, so provide base URL only
      NEXT_PUBLIC_WS_BASE_URL: realtimeWs.url,

      // server-only (NOT NEXT_PUBLIC)
      QZ_PRIVATE_KEY_SECRET_ID: qzSecretId,
    },

    permissions: [
      {
        actions: ['secretsmanager:GetSecretValue'],
        resources: ['*'],
      },
    ],
  });

  // ✅ Optional but recommended:
  // Fail fast during deploy if missing in prod stage.
  // (If you want stage-aware gating, we can add SST_STAGE checks.)
  if (!qzSecretId) {
    console.warn(
      '[warn] QZ_PRIVATE_KEY_SECRET_ID is empty. /api/qz/sign will fail until you set it in GitHub Secrets.',
    );
  }

  return web;
}
