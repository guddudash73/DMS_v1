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
  /**
   * ✅ PRIVATE bucket (default).
   * Do NOT set access: "public".
   * Do NOT set access: "cloudfront" unless you are *serving* objects via Router/CloudFront.
   * Presigned URLs work with a private bucket.
   */

  // ✅ Browser uploads need CORS for presigned PUT
  cors: {
    allowMethods: ['GET', 'PUT', 'HEAD'],
    allowOrigins: ['*'], // tighten to your CloudFront domain later
    allowHeaders: ['*'],
    exposeHeaders: ['ETag'],
    // maxAge is optional; leaving it out avoids type mismatch across SST versions
  },
});
