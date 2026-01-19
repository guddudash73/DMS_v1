/// <reference path="../.sst/platform/config.d.ts" />

export function createWeb(router: sst.aws.Router) {
  const qzSecretId = process.env.QZ_PRIVATE_KEY_SECRET_ID ?? '';

  /**
   * CRITICAL FIX:
   * Do NOT pass Pulumi Outputs (like realtimeWs.url) into Nextjs environment.
   * It can cause SST/Pulumi post-processing to stringify a massive object graph
   * -> RangeError: Invalid string length.
   *
   * Instead:
   * - Keep API base as relative (/api)
   * - Provide WS base from CI env (string) or leave empty for now.
   */
  const wsBaseUrl = process.env.NEXT_PUBLIC_WS_BASE_URL ?? '';

  const web = new sst.aws.Nextjs('Web', {
    path: 'apps/web',
    router: {
      instance: router,
    },

    environment: {
      NEXT_PUBLIC_API_BASE_URL: '/api',

      // Must be a plain string (NOT an Output)
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

  if (!qzSecretId) {
    console.warn(
      '[warn] QZ_PRIVATE_KEY_SECRET_ID is empty. /api/qz/sign will fail until you set it in GitHub Secrets.',
    );
  }

  if (!wsBaseUrl) {
    console.warn(
      '[warn] NEXT_PUBLIC_WS_BASE_URL is empty. Realtime features will not work until you set it (GitHub Secret or env).',
    );
  }

  return web;
}
