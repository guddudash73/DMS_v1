/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      name: 'sarangi-dms',
      home: 'aws',
      providers: {
        aws: {
          region: 'us-east-1',
        },
      },
    };
  },

  async run() {
    await import('./infra/realtime');
  },
});
