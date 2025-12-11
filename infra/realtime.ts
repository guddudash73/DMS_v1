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

  environment: {
    NODE_ENV: 'production',
    DYNAMO_ENDPOINT: 'https://dynamodb.us-east-1.amazonaws.com',
    S3_ENDPOINT: 'https://s3.us-east-1.amazonaws.com',
    DDB_TABLE_NAME: 'dms-dev-table',
    XRAY_BUCKET_NAME: 'dms-xray-dev',

    JWT_ACCESS_SECRET: '9865051247d25d11966eb816115aa44b605c7ad089f6f48d',
    JWT_REFRESH_SECRET: '99be42f9cf7eebcaf888d67bdf3a4c54d83d876818ba6a4d',
    DDB_CONNECTIONS_TABLE: connectionsTable.name,

    REALTIME_WS_ENDPOINT: 'https://1w3u2jilck.execute-api.us-east-1.amazonaws.com/$default',
  },
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
