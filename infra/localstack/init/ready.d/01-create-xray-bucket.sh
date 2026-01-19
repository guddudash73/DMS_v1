#!/usr/bin/env sh
set -eu

echo "[localstack:init] creating xray bucket if missing..."
: "${XRAY_BUCKET_NAME:=dms-xray-dev}"
: "${AWS_DEFAULT_REGION:=us-east-1}"
: "${WEB_ORIGIN:=http://localhost:3000}"

awslocal s3 mb "s3://${XRAY_BUCKET_NAME}" 2>/dev/null || true

awslocal s3api put-public-access-block \
  --bucket "${XRAY_BUCKET_NAME}" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true \
  2>/dev/null || true

echo "[localstack:init] applying S3 CORS to bucket: ${XRAY_BUCKET_NAME}"

awslocal s3api put-bucket-cors \
  --bucket "${XRAY_BUCKET_NAME}" \
  --cors-configuration "{
    \"CORSRules\": [
      {
        \"AllowedOrigins\": [\"${WEB_ORIGIN}\", \"http://127.0.0.1:3000\"],
        \"AllowedMethods\": [\"GET\", \"PUT\", \"HEAD\"],
        \"AllowedHeaders\": [\"*\"],
        \"ExposeHeaders\": [\"ETag\", \"x-amz-request-id\", \"x-amz-id-2\"],
        \"MaxAgeSeconds\": 3000
      }
    ]
  }"

echo "[localstack:init] xray bucket ready + CORS applied: ${XRAY_BUCKET_NAME}"
