import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import type { StorageProvider } from './index';

export class R2Storage implements StorageProvider {
  readonly name = 'cloudflare-r2';
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrl: string;

  constructor() {
    const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
    const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
    this.bucket = process.env.CLOUDFLARE_R2_BUCKET_NAME ?? '';
    this.publicUrl = (process.env.CLOUDFLARE_R2_PUBLIC_URL ?? '').replace(/\/+$/, '');

    if (!accountId || !accessKeyId || !secretAccessKey || !this.bucket || !this.publicUrl) {
      throw new Error(
        'R2Storage: missing env vars. Need CLOUDFLARE_R2_ACCOUNT_ID, ' +
          'CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY, ' +
          'CLOUDFLARE_R2_BUCKET_NAME, CLOUDFLARE_R2_PUBLIC_URL.',
      );
    }

    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async putBytes({
    folder,
    filename,
    data,
    contentType,
  }: {
    folder: string;
    filename: string;
    data: Uint8Array;
    contentType: string;
  }): Promise<{ url: string }> {
    const safeFolder = folder.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `${safeFolder}/${safeFilename}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      }),
    );

    return { url: `${this.publicUrl}/${key}` };
  }
}
