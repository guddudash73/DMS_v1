'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.parseEnv = void 0;
var zod_1 = require('zod');
var EnvSchema = zod_1.z.object({
  NODE_ENV: zod_1.z.enum(['development', 'test', 'production']),
  PORT: zod_1.z.string().optional(),
  APP_REGION: zod_1.z.string().min(1),
  DYNAMO_ENDPOINT: zod_1.z.string().min(1),
  S3_ENDPOINT: zod_1.z.string().min(1),
  DDB_TABLE_NAME: zod_1.z.string().min(1),
  XRAY_BUCKET_NAME: zod_1.z.string().min(1),
  CORS_ORIGIN: zod_1.z.string().optional(),
  ACCESS_TOKEN_TTL_SEC: zod_1.z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SEC: zod_1.z.coerce
    .number()
    .int()
    .positive()
    .default(60 * 60 * 24 * 14),
  JWT_ACCESS_SECRET: zod_1.z.string().min(32),
  JWT_REFRESH_SECRET: zod_1.z.string().min(32),
});
var parseEnv = function (raw) {
  return EnvSchema.parse(raw);
};
exports.parseEnv = parseEnv;
