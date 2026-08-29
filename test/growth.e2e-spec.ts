import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { MembershipRole } from '@prisma/client';
import { Server } from 'node:http';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/infrastructure/database/prisma.service';
import { ObjectStorageService } from '../src/infrastructure/storage/object-storage.service';
import { TokenPairDto } from '../src/modules/identity/dto/auth-response.dto';

const password = 'DevelopmentOnly!123';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

describe('growth features (e2e)', () => {
  let app: INestApplication;
  let server: Server;
  let prisma: PrismaService;
  let storage: ObjectStorageService;
  let developerToken: string;
  let brokerToken: string;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
    server = app.getHttpServer() as Server;
    prisma = app.get(PrismaService);
    storage = app.get(ObjectStorageService);
    developerToken = await login('developer@planda.test');
    brokerToken = await login('broker@planda.test');
  });

  afterAll(async () => app.close());

  async function login(email: string): Promise<string> {
    const response = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password })
      .expect(200);
    return (response.body as TokenPairDto).accessToken;
  }

  it('validates, publishes, clears alt text and deletes real project media', async () => {
    const project = await prisma.project.findUniqueOrThrow({
      where: { slug: 'seed-park' },
      select: { id: true, slug: true },
    });
    const mediaIds = new Set<string>();
    try {
      await request(server)
        .post(`/api/v1/developer/projects/${project.id}/media`)
        .set('Authorization', `Bearer ${developerToken}`)
        .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]), {
          filename: 'invalid.png',
          contentType: 'image/png',
        })
        .expect(422);

      await request(server)
        .post(`/api/v1/developer/projects/${project.id}/media`)
        .set('Authorization', `Bearer ${developerToken}`)
        .field('kind', 'VIDEO')
        .attach('file', png, { filename: 'valid.png', contentType: 'image/png' })
        .expect(400);

      const upload = await request(server)
        .post(`/api/v1/developer/projects/${project.id}/media`)
        .set('Authorization', `Bearer ${developerToken}`)
        .field('altText', 'Backend E2E image')
        .attach('file', png, { filename: 'valid.png', contentType: 'image/png' })
        .expect(201);
      const uploaded = upload.body as {
        id: string;
        url: string;
        altText: string | null;
        version: number;
      };
      mediaIds.add(uploaded.id);
      expect(uploaded.url.endsWith(`/api/v1/media/${uploaded.id}`)).toBe(true);

      const secondUpload = await request(server)
        .post(`/api/v1/developer/projects/${project.id}/media`)
        .set('Authorization', `Bearer ${developerToken}`)
        .field('altText', 'Second backend E2E image')
        .attach('file', png, { filename: 'second.png', contentType: 'image/png' })
        .expect(201);
      const second = secondUpload.body as { id: string; version: number };
      mediaIds.add(second.id);

      const beforeFailedReorder = await prisma.projectMedia.findMany({
        where: { id: { in: [uploaded.id, second.id] } },
        select: { id: true, sortOrder: true, version: true },
        orderBy: { id: 'asc' },
      });
      await request(server)
        .put(`/api/v1/developer/projects/${project.id}/media/reorder`)
        .set('Authorization', `Bearer ${developerToken}`)
        .send({
          items: [
            { id: uploaded.id, version: uploaded.version },
            { id: second.id, version: second.version + 1 },
          ],
        })
        .expect(409);
      await expect(
        prisma.projectMedia.findMany({
          where: { id: { in: [uploaded.id, second.id] } },
          select: { id: true, sortOrder: true, version: true },
          orderBy: { id: 'asc' },
        }),
      ).resolves.toEqual(beforeFailedReorder);

      const detail = await request(server).get(`/api/v1/projects/${project.slug}`).expect(200);
      const detailBody = detail.body as {
        media: Array<{ id: string; altText: string | null }>;
      };
      expect(detailBody.media).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: uploaded.id, altText: 'Backend E2E image' }),
        ]),
      );

      await request(server)
        .get(`/api/v1/media/${uploaded.id}`)
        .expect('Content-Type', /image\/png/)
        .expect('Cross-Origin-Resource-Policy', 'cross-origin')
        .expect('Cache-Control', 'public, max-age=0, must-revalidate')
        .expect(200);

      const cleared = await request(server)
        .patch(`/api/v1/developer/projects/${project.id}/media/${uploaded.id}`)
        .set('Authorization', `Bearer ${developerToken}`)
        .send({ version: uploaded.version, altText: '' })
        .expect(200);
      const clearedBody = cleared.body as { altText: string | null; version: number };
      expect(clearedBody.altText).toBeNull();

      await request(server)
        .delete(
          `/api/v1/developer/projects/${project.id}/media/${uploaded.id}?version=${clearedBody.version}`,
        )
        .set('Authorization', `Bearer ${developerToken}`)
        .expect(204);
      mediaIds.delete(uploaded.id);
      await request(server).get(`/api/v1/media/${uploaded.id}`).expect(404);

      await request(server)
        .delete(
          `/api/v1/developer/projects/${project.id}/media/${second.id}?version=${second.version}`,
        )
        .set('Authorization', `Bearer ${developerToken}`)
        .expect(204);
      mediaIds.delete(second.id);
    } finally {
      for (const mediaId of mediaIds) {
        const row = await prisma.projectMedia.findUnique({ where: { id: mediaId } });
        if (row) {
          await storage.delete(row.storageKey).catch(() => undefined);
          await prisma.projectMedia.deleteMany({ where: { id: mediaId } });
        }
      }
    }
  });

  it('allows a broker agency MEMBER to create and soft-archive a client', async () => {
    const broker = await prisma.user.findUniqueOrThrow({
      where: { email: 'broker@planda.test' },
      include: { memberships: true },
    });
    const membership = broker.memberships[0]!;
    let clientId: string | undefined;
    await prisma.organizationMembership.update({
      where: {
        userId_organizationId: {
          userId: broker.id,
          organizationId: membership.organizationId,
        },
      },
      data: { role: MembershipRole.MEMBER },
    });
    try {
      const created = await request(server)
        .post(`/api/v1/broker/clients?organizationId=${membership.organizationId}`)
        .set('Authorization', `Bearer ${brokerToken}`)
        .send({ fullName: 'Backend E2E client', phone: '+905551112233' })
        .expect(201);
      const createdBody = created.body as { id: string; version: number };
      clientId = createdBody.id;

      await request(server)
        .delete(`/api/v1/broker/clients/${createdBody.id}?version=${createdBody.version}`)
        .set('Authorization', `Bearer ${brokerToken}`)
        .expect(204);
      const archived = await prisma.brokerClient.findUniqueOrThrow({
        where: { id: createdBody.id },
      });
      expect(archived.status).toBe('ARCHIVED');
    } finally {
      if (clientId) await prisma.brokerClient.deleteMany({ where: { id: clientId } });
      await prisma.organizationMembership.update({
        where: {
          userId_organizationId: {
            userId: broker.id,
            organizationId: membership.organizationId,
          },
        },
        data: { role: membership.role },
      });
    }
  });

  it('enforces developer and broker tenant boundaries for explicit identifiers', async () => {
    const broker = await prisma.user.findUniqueOrThrow({
      where: { email: 'broker@planda.test' },
    });
    const suffix = Date.now().toString(36);
    const developerOrg = await prisma.organization.create({
      data: {
        name: 'Foreign Developer E2E',
        slug: `foreign-developer-${suffix}`,
        type: 'DEVELOPER',
      },
    });
    const brokerOrg = await prisma.organization.create({
      data: {
        name: 'Foreign Broker E2E',
        slug: `foreign-broker-${suffix}`,
        type: 'BROKER_AGENCY',
      },
    });
    const foreignClient = await prisma.brokerClient.create({
      data: {
        organizationId: brokerOrg.id,
        createdById: broker.id,
        fullName: 'Foreign client',
        phone: '+905551112233',
      },
    });
    try {
      await request(server)
        .get(`/api/v1/developer/analytics?range=7&organizationId=${developerOrg.id}`)
        .set('Authorization', `Bearer ${developerToken}`)
        .expect(404);
      await request(server)
        .get(`/api/v1/broker/clients/${foreignClient.id}`)
        .set('Authorization', `Bearer ${brokerToken}`)
        .expect(404);
    } finally {
      await prisma.brokerClient.deleteMany({ where: { id: foreignClient.id } });
      await prisma.organization.deleteMany({
        where: { id: { in: [developerOrg.id, brokerOrg.id] } },
      });
    }
  });

  it('rejects developer settings changes from a MEMBER role', async () => {
    const developer = await prisma.user.findUniqueOrThrow({
      where: { email: 'developer@planda.test' },
      include: { memberships: { include: { organization: true } } },
    });
    const membership = developer.memberships.find(
      ({ organization }) => organization.type === 'DEVELOPER',
    )!;
    await prisma.organizationMembership.update({
      where: {
        userId_organizationId: {
          userId: developer.id,
          organizationId: membership.organizationId,
        },
      },
      data: { role: MembershipRole.MEMBER },
    });
    try {
      await request(server)
        .patch(`/api/v1/developer/settings?organizationId=${membership.organizationId}`)
        .set('Authorization', `Bearer ${developerToken}`)
        .send({
          version: membership.organization.version,
          name: membership.organization.name,
        })
        .expect(403);
    } finally {
      await prisma.organizationMembership.update({
        where: {
          userId_organizationId: {
            userId: developer.id,
            organizationId: membership.organizationId,
          },
        },
        data: { role: membership.role },
      });
    }
  });
});
