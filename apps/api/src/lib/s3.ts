import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AWS_REGION, S3_ENDPOINT } from '../config/env';

const DEFAULT_PRESIGN_TTL_SECONDS = 90;

export const s3Client = new S3Client({
  region: AWS_REGION,
  endpoint: S3_ENDPOINT,
  forcePathStyle: true,
});

/**
 * Generate a presigned PUT URL for uploading an object to S3.
 *
 * @param bucket - Target S3 bucket name.
 * @param key - Object key in the bucket.
 * @param contentType - MIME type of the object being uploaded.
 * @param contentLength - Size of the object in bytes.
 * @param expiresInSeconds - Optional TTL for the URL (defaults to ~90s).
 */

export const getPresignedUploadUrl = async (params: {
  bucket: string;
  key: string;
  contentType: string;
  contentLength: number;
  expiresInSeconds?: number;
}): Promise<string> => {
  const command = new PutObjectCommand({
    Bucket: params.bucket,
    Key: params.key,
    ContentType: params.contentType,
    ContentLength: params.contentLength,
  });

  return getSignedUrl(s3Client, command, {
    expiresIn: params.expiresInSeconds ?? DEFAULT_PRESIGN_TTL_SECONDS,
  });
};

/**
 * Generate a presigned GET URL for downloading an object from S3.
 *
 * @param bucket - Target S3 bucket name.
 * @param key - Object key in the bucket.
 * @param expiresInSeconds - Optional TTL for the URL (defaults to ~90s).
 */
export const getPresignedDownloadUrl = async (params: {
  bucket: string;
  key: string;
  expiresInSeconds?: number;
}): Promise<string> => {
  const command = new GetObjectCommand({
    Bucket: params.bucket,
    Key: params.key,
  });

  return getSignedUrl(s3Client, command, {
    expiresIn: params.expiresInSeconds ?? DEFAULT_PRESIGN_TTL_SECONDS,
  });
};
