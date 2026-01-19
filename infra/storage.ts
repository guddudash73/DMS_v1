// infra/storage.ts
/// <reference path="../.sst/platform/config.d.ts" />

export const mainTable = new sst.aws.Dynamo('MainTable', {
  fields: {
    PK: 'string',
    SK: 'string',
    GSI1PK: 'string',
    GSI1SK: 'string',
    GSI2PK: 'string',
    GSI2SK: 'string',
    GSI3PK: 'string',
    GSI3SK: 'string',
  },
  primaryIndex: { hashKey: 'PK', rangeKey: 'SK' },
  globalIndexes: {
    GSI1: { hashKey: 'GSI1PK', rangeKey: 'GSI1SK' },
    GSI2: { hashKey: 'GSI2PK', rangeKey: 'GSI2SK' },
    GSI3: { hashKey: 'GSI3PK', rangeKey: 'GSI3SK' },
  },
});

export const xrayBucket = new sst.aws.Bucket('XrayBucket', {
  // prevents public access; CloudFront access is via OAC when needed
  access: 'cloudfront',
});
