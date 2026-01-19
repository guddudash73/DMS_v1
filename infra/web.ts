/// <reference path="../.sst/platform/config.d.ts" />

export function createWeb(router: sst.aws.Router) {
  const qzSecretId = process.env.QZ_PRIVATE_KEY_SECRET_ID ?? '';
  const wsBaseUrl = process.env.NEXT_PUBLIC_WS_BASE_URL ?? '';

  const web = new sst.aws.Nextjs('Web', {
    path: 'apps/web',
    router: {
      instance: router,
    },

    environment: {
      // same-origin API via Router -> /api
      NEXT_PUBLIC_API_BASE_URL: '/api',

      // ✅ Provide WS URL as a plain string (configured in GitHub Secrets)
      // Example: wss://<your-ws-domain>/<stage>
      NEXT_PUBLIC_WS_BASE_URL: wsBaseUrl,

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

  // Fail-fast warnings (prod safety)
  if (!qzSecretId) {
    console.warn(
      '[warn] QZ_PRIVATE_KEY_SECRET_ID is empty. /api/qz/sign will fail until you set it in GitHub Secrets.',
    );
  }

  if (!wsBaseUrl) {
    console.warn(
      '[warn] NEXT_PUBLIC_WS_BASE_URL is empty. Realtime websocket client will not connect until set.',
    );
  }

  return web;
}
