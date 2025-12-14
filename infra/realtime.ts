/// <reference path="../.sst/platform/config.d.ts" />

export const connectionsTable = new sst.aws.Dynamo('ConnectionsTable', {
  fields: {
    PK: 'string',
    SK: 'string',
  },
  primaryIndex: { hashKey: 'PK', rangeKey: 'SK' },
});

export const realtimeWs = new sst.aws.ApiGatewayWebSocket('RealtimeWs');

realtimeWs.route('$connect', {
  handler: 'apps/api/src/realtime/wsConnect.handler',
  link: [connectionsTable],
});
realtimeWs.route('$disconnect', {
  handler: 'apps/api/src/realtime/wsDisconnect.handler',
  link: [connectionsTable],
  environment: {
    DDB_CONNECTIONS_TABLE: connectionsTable.name,
  },
});

realtimeWs.route('$default', {
  handler: 'apps/api/src/realtime/wsDefault.handler',
});
