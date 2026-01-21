/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app() {
    return {
      name: 'sarangi-dcm',
      home: 'aws',
      providers: { aws: { region: 'us-east-1' } },
    };
  },

  async run() {
    // 1) realtime
    await import('./infra/realtime');

    // 2) storage + router + api + web
    await import('./infra/storage');

    const router = new sst.aws.Router('AppRouter');

    const { createApi } = await import('./infra/api');
    createApi(router);

    const { createWeb } = await import('./infra/web');
    createWeb(router);

    // IMPORTANT: do not return outputs; SST post-processing can choke on serialization.
    return {};
  },
});
