import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AWS_REGION, S3_ENDPOINT } from '../config/env';

const DEFAULT_PRESIGN_TTL_SECONDS = 90;

export const s3Client = new S3Client({
  region: AWS_REGION,
  endpoint: S3_ENDPOINT,
  forcePathStyle: true,
});

type PresignUploadParams = {
  bucket: string;
  key: string;
  contentType: string;
  contentLength: number;
  expiresInSeconds?: number;
  serverSideEncryption?: 'AES256' | 'aws:kms';
  sseKmsKeyId?: string;
};

/**
 * Generate a presigned PUT URL for uploading an object to S3.
 *
 * @param bucket - Target S3 bucket name.
 * @param key - Object key in the bucket.
 * @param contentType - MIME type of the object being uploaded.
 * @param contentLength - Size of the object in bytes.
 * @param expiresInSeconds - Optional TTL for the URL (defaults to ~90s).
 * @param serverSideEncryption - Optional SSE mode ("AES256" or "aws:kms", defaults to "AES256").
 * @param sseKmsKeyId - Optional KMS key ID when using "aws:kms".
 */
export const getPresignedUploadUrl = async (params: PresignUploadParams): Promise<string> => {
  const command = new PutObjectCommand({
    Bucket: params.bucket,
    Key: params.key,
    ContentType: params.contentType,
    ContentLength: params.contentLength,
    ServerSideEncryption: params.serverSideEncryption ?? 'AES256',
    ...(params.sseKmsKeyId ? { SSEKMSKeyId: params.sseKmsKeyId } : {}),
  });

  return getSignedUrl(s3Client, command, {
    expiresIn: params.expiresInSeconds ?? DEFAULT_PRESIGN_TTL_SECONDS,
  });
};

type PresignDownloadParams = {
  bucket: string;
  key: string;
  /**
   * Time-to-live for the presigned URL (seconds).
   * Defaults to ~90 seconds if not provided.
   */
  expiresInSeconds?: number;
};

/**
 * Generate a presigned GET URL for downloading an object from S3.
 *
 * @param bucket - Target S3 bucket name.
 * @param key - Object key in the bucket.
 * @param expiresInSeconds - Optional TTL for the URL (defaults to ~90s).
 */
export const getPresignedDownloadUrl = async (params: PresignDownloadParams): Promise<string> => {
  const command = new GetObjectCommand({
    Bucket: params.bucket,
    Key: params.key,
  });

  return getSignedUrl(s3Client, command, {
    expiresIn: params.expiresInSeconds ?? DEFAULT_PRESIGN_TTL_SECONDS,
  });
};
