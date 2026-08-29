import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
@Injectable()
export class ObjectStorageService {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;
  constructor(config: ConfigService) {
    this.bucket = config.getOrThrow<string>('storage.bucket');
    this.publicBaseUrl = config.getOrThrow<string>('storage.publicBaseUrl').replace(/\/$/, '');
    this.client = new S3Client({
      endpoint: config.getOrThrow<string>('storage.endpoint'),
      region: config.getOrThrow<string>('storage.region'),
      forcePathStyle: config.get<boolean>('storage.forcePathStyle') ?? true,
      credentials: {
        accessKeyId: config.getOrThrow<string>('storage.accessKey'),
        secretAccessKey: config.getOrThrow<string>('storage.secretKey'),
      },
    });
  }
  async put(key: string, body: Buffer, contentType: string): Promise<string> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
    const mediaId = key.split('/').at(-1)!.split('.')[0];
    return `${this.publicBaseUrl}/${mediaId}`;
  }
  async get(key: string): Promise<{ body: Uint8Array; contentType: string }> {
    const result = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return {
      body: await result.Body!.transformToByteArray(),
      contentType: result.ContentType ?? 'application/octet-stream',
    };
  }
  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
  async ping(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }
}
