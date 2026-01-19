/// <reference path="../.sst/platform/config.d.ts" />

export const connectionsTable = new sst.aws.Dynamo('ConnectionsTable', {
  fields: {
    PK: 'string',
    SK: 'string',
    GSI1PK: 'string',
    GSI1SK: 'string',
  },
  primaryIndex: {
    hashKey: 'PK',
    rangeKey: 'SK',
  },
  globalIndexes: {
    EntityTypeIndex: {
      hashKey: 'GSI1PK',
      rangeKey: 'GSI1SK',
    },
  },
});

const jwtAccessSecret = new sst.Secret('JWT_ACCESS_SECRET');
const jwtRefreshSecret = new sst.Secret('JWT_REFRESH_SECRET');

export const realtimeWs = new sst.aws.ApiGatewayWebSocket('RealtimeWs');

realtimeWs.route('$connect', {
  runtime: 'nodejs20.x',
  handler: 'apps/api/src/realtime/wsConnect.handler',

  // ✅ Explicit
  link: [connectionsTable, jwtAccessSecret, jwtRefreshSecret],

  environment: {
    NODE_ENV: 'production',
    APP_REGION: 'us-east-1',

    DDB_CONNECTIONS_TABLE: connectionsTable.name,

    JWT_ACCESS_SECRET: jwtAccessSecret.value,
    JWT_REFRESH_SECRET: jwtRefreshSecret.value,

    REALTIME_WS_ENDPOINT: realtimeWs.managementEndpoint,
  },
});

realtimeWs.route('$disconnect', {
  runtime: 'nodejs20.x',
  handler: 'apps/api/src/realtime/wsDisconnect.handler',

  link: [connectionsTable],

  environment: {
    DDB_CONNECTIONS_TABLE: connectionsTable.name,
  },
});

realtimeWs.route('$default', {
  runtime: 'nodejs20.x',
  handler: 'apps/api/src/realtime/wsDefault.handler',

  link: [connectionsTable],

  environment: {
    DDB_CONNECTIONS_TABLE: connectionsTable.name,
    REALTIME_WS_ENDPOINT: realtimeWs.managementEndpoint,
  },
});
