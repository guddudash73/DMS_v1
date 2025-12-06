import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { s3Client } from '../lib/s3';
import { XRAY_BUCKET_NAME } from '../config/env';
import { logInfo } from '../lib/logger';

type S3Body = AsyncIterable<unknown> & {
  transformToByteArray?: () => Promise<Uint8Array>;
};

export async function generateXrayThumbnail(params: {
  contentKey: string;
  thumbKey: string;
  contentType: 'image/jpeg' | 'image/png';
}): Promise<void> {
  const { contentKey, thumbKey, contentType } = params;

  const getRes = await s3Client.send(
    new GetObjectCommand({
      Bucket: XRAY_BUCKET_NAME,
      Key: contentKey,
    }),
  );

  const body = getRes.Body;
  if (!body) {
    throw new Error('Missing X-ray object body');
  }

  let sourceBytes: Uint8Array;
  const stream = body as S3Body;

  if (typeof stream.transformToByteArray === 'function') {
    sourceBytes = await stream.transformToByteArray();
  } else {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      if (Buffer.isBuffer(chunk)) {
        chunks.push(chunk);
      } else if (chunk instanceof Uint8Array) {
        chunks.push(Buffer.from(chunk));
      } else if (typeof chunk === 'string') {
        chunks.push(Buffer.from(chunk));
      } else {
        chunks.push(Buffer.from(String(chunk)));
      }
    }
    sourceBytes = Buffer.concat(chunks);
  }

  const sharpInstance = sharp(Buffer.from(sourceBytes));
  const resized =
    contentType === 'image/png'
      ? await sharpInstance
          .resize({ width: 512, height: 512, fit: 'inside' })
          .png({ compressionLevel: 9 })
          .toBuffer()
      : await sharpInstance
          .resize({ width: 512, height: 512, fit: 'inside' })
          .jpeg({ quality: 75 })
          .toBuffer();

  await s3Client.send(
    new PutObjectCommand({
      Bucket: XRAY_BUCKET_NAME,
      Key: thumbKey,
      Body: resized,
      ContentType: contentType,
      ServerSideEncryption: 'AES256',
    }),
  );

  logInfo('xray_thumbnail_created', {
    contentKey,
    thumbKey,
    contentType,
  });
}
