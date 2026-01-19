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
    // Create base resources first (reduces cross-module cycles)
    const { mainTable, xrayBucket } = await import('./infra/storage');

    // Realtime can be created before Router. It does not need the Router.
    await import('./infra/realtime');

    // Router for same-origin routing (/api -> lambda; web -> next)
    const router = new sst.aws.Router('AppRouter');

    // API behind Router (/api)
    const { createApi } = await import('./infra/api');
    createApi(router);

    // Web behind Router (default)
    const { createWeb } = await import('./infra/web');
    createWeb(router);

    // ✅ Keep outputs small & stable (avoid huge Pulumi graphs in CLI output)
    return {
      tableName: mainTable.name,
      xrayBucket: xrayBucket.name,
    };
  },
});
