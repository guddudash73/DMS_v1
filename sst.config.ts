// sst.config.ts
/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: 'sarangi-dcm',
      home: 'aws',
      providers: { aws: { region: 'us-east-1' } },
    };
  },

  async run() {
    // 1) realtime (kept)
    await import('./infra/realtime');

    // 2) storage + router + api + web
    const { mainTable, xrayBucket } = await import('./infra/storage');

    const router = new sst.aws.Router('AppRouter');

    const { createApi } = await import('./infra/api');
    const apiFn = createApi(router);

    const { createWeb } = await import('./infra/web');
    createWeb(router);

    // Optional outputs if you want
    return {
      apiUrl: apiFn.url,
      routerUrl: router.url,
      tableName: mainTable.name,
      xrayBucket: xrayBucket.name,
    };
  },
});
