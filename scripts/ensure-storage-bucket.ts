import { CreateBucketCommand, HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';

const bucket = process.env.STORAGE_BUCKET;
const endpoint = process.env.STORAGE_ENDPOINT;
const accessKeyId = process.env.STORAGE_ACCESS_KEY;
const secretAccessKey = process.env.STORAGE_SECRET_KEY;

if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) {
  throw new Error('Storage endpoint, bucket and credentials are required');
}

const client = new S3Client({
  endpoint,
  region: process.env.STORAGE_REGION ?? 'us-east-1',
  forcePathStyle: (process.env.STORAGE_FORCE_PATH_STYLE ?? 'true') === 'true',
  credentials: { accessKeyId, secretAccessKey },
});

async function ensureBucket(): Promise<void> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
  } catch {
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
  }
}

void ensureBucket();
