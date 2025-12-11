/// <reference path="./.sst/platform/config.d.ts" />

export default $config({
  app(input) {
    return {
      // This shows up in the SST Console and forms part of resource names
      name: 'sarangi-dms',
      home: 'aws',
      providers: {
        aws: {
          region: 'us-east-1',
        },
      },
    };
  },

  // This is the v3 replacement for "stacks(app)".
  async run() {
    // Keep infra isolated in its own file/module
    await import('./infra/realtime');
  },
});
