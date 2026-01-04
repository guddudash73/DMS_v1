// apps/api/src/lib/s3.ts
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3Client } from '../config/aws';
import { getEnv } from '../config/env';

const DEFAULT_PRESIGN_TTL_SECONDS = 90;

export { s3Client };

type PresignUploadParams = {
  bucket: string;
  key: string;
  contentType: string;
  contentLength: number;
  expiresInSeconds?: number;
  serverSideEncryption?: 'AES256' | 'aws:kms';
  sseKmsKeyId?: string;
};

type PresignDownloadParams = {
  bucket: string;
  key: string;
  expiresInSeconds?: number;
};

function rewriteToPublicEndpoint(url: string): string {
  const env = getEnv();

  if (!env.S3_PUBLIC_ENDPOINT) return url;

  try {
    const signed = new URL(url);

    const internal = new URL(env.S3_ENDPOINT);
    const publicEp = new URL(env.S3_PUBLIC_ENDPOINT);

    if (signed.host !== internal.host) return url;

    signed.protocol = publicEp.protocol;
    signed.host = publicEp.host;

    return signed.toString();
  } catch {
    return url;
  }
}

export const getPresignedUploadUrl = async (params: PresignUploadParams): Promise<string> => {
  const command = new PutObjectCommand({
    Bucket: params.bucket,
    Key: params.key,
    ContentType: params.contentType,
    ContentLength: params.contentLength,
    ServerSideEncryption: params.serverSideEncryption ?? 'AES256',
    ...(params.sseKmsKeyId ? { SSEKMSKeyId: params.sseKmsKeyId } : {}),
  });

  const signed = await getSignedUrl(s3Client, command, {
    expiresIn: params.expiresInSeconds ?? DEFAULT_PRESIGN_TTL_SECONDS,
  });

  return rewriteToPublicEndpoint(signed);
};

export const getPresignedDownloadUrl = async (params: PresignDownloadParams): Promise<string> => {
  const command = new GetObjectCommand({
    Bucket: params.bucket,
    Key: params.key,
  });

  const signed = await getSignedUrl(s3Client, command, {
    expiresIn: params.expiresInSeconds ?? DEFAULT_PRESIGN_TTL_SECONDS,
  });

  return rewriteToPublicEndpoint(signed);
};
