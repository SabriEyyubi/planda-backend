import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PreferredLanguage, Project } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Server } from 'node:http';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { ApiExceptionFilter } from '../src/common/filters/api-exception.filter';
import { PrismaService } from '../src/infrastructure/database/prisma.service';
import { TokenPairDto } from '../src/modules/identity/dto/auth-response.dto';
import { CreateLeadDto } from '../src/modules/marketplace/dto/create-lead.dto';
import {
  LeadResponseDto,
  UnitResponseDto,
} from '../src/modules/marketplace/dto/marketplace-response.dto';

function requireIsolatedDatabase(): void {
  const database = new URL(process.env.DATABASE_URL ?? '');
  const name = decodeURIComponent(database.pathname.slice(1));
  if (
    process.env.NODE_ENV !== 'test' ||
    process.env.PLANDA_E2E_DATABASE_NAME !== name ||
    !name ||
    !['localhost', '127.0.0.1', '[::1]'].includes(database.hostname)
  ) {
    throw new Error(
      'Use NODE_ENV=test and acknowledge a dedicated loopback test database with PLANDA_E2E_DATABASE_NAME',
    );
  }
}

describe('marketplace real-service journeys', () => {
  let app: INestApplication | undefined;
  let server: Server;
  let prisma: PrismaService;
  let source: Project;
  let project: Project | undefined;
  let developerToken: string;
  let buyerToken: string;
  let consentVersion: string;
  let publishedIds: string[];

  beforeAll(async () => {
    requireIsolatedDatabase();
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
    server = app.getHttpServer() as Server;
    prisma = app.get(PrismaService);
    consentVersion = app.get(ConfigService).getOrThrow<string>('leadConsent.currentVersion');
    source = await prisma.project.findUniqueOrThrow({ where: { slug: 'seed-park' } });
    publishedIds = (
      await prisma.project.findMany({
        where: { status: 'PUBLISHED' },
        select: { id: true },
        orderBy: { id: 'asc' },
      })
    ).map(({ id }) => id);
    developerToken = await login('developer@planda.test');
    buyerToken = await login('buyer@planda.test');
  });

  beforeEach(async () => {
    project = await prisma.project.create({
      data: {
        name: 'Isolated marketplace journey',
        slug: `journey-${randomUUID()}`,
        developerOrganizationId: source.developerOrganizationId,
        provinceId: source.provinceId,
        districtId: source.districtId,
        latitude: source.latitude,
        longitude: source.longitude,
        startingPrice: '999',
        currency: 'TRY',
        status: 'PUBLISHED',
      },
    });
  });

  afterEach(async () => {
    if (!project) return;
    // Audit rows are append-only. Keep them and remove only this test's records.
    await prisma.lead.deleteMany({ where: { projectId: project.id } });
    await prisma.project.delete({ where: { id: project.id } });
    project = undefined;
    const remaining = await prisma.project.findMany({
      where: { status: 'PUBLISHED' },
      select: { id: true },
      orderBy: { id: 'asc' },
    });
    expect(remaining.map(({ id }) => id)).toEqual(publishedIds);
  });

  afterAll(async () => app?.close());

  async function login(email: string): Promise<string> {
    const response = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: 'DevelopmentOnly!123' })
      .expect(200);
    return (response.body as TokenPairDto).accessToken;
  }

  function leadBody(): CreateLeadDto {
    return {
      fullName: 'Isolated test buyer',
      phone: '+905551110099',
      preferredLanguage: PreferredLanguage.TR,
      currency: 'TRY',
      consentToDeveloper: true,
      consentVersion,
    };
  }

  it('serializes overlapping inventory writes and derives the eligible currency minimum', async () => {
    const id = project!.id;
    let writes: Array<Promise<request.Response>> = [];
    try {
      await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM projects WHERE id = ${id}::uuid FOR UPDATE`;
          writes = [400, 250].map((price) =>
            request(server)
              .post(`/api/v1/developer/projects/${id}/units`)
              .set('Authorization', `Bearer ${developerToken}`)
              .send({
                unitNumber: String(price),
                roomType: '2+1',
                netArea: '80',
                price: String(price),
                currency: 'TRY',
              })
              .expect(201)
              .then((response) => response),
          );
          // One bounded observation of real blocked SQL, not a mocked lock call.
          await new Promise((resolve) => setTimeout(resolve, 500));
          const waiting = await prisma.$queryRaw<Array<{ count: number }>>`
          SELECT count(*)::int AS count FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock'
          AND query LIKE '%projects%'
        `;
          expect(waiting[0]!.count).toBeGreaterThanOrEqual(2);
        },
        { timeout: 5000 },
      );
      const units = (await Promise.all(writes)).map(({ body }) => body as UnitResponseDto);
      expect(units).toHaveLength(2);
      const first = units[0]!;
      const second = units[1]!;
      expect(
        (await prisma.project.findUniqueOrThrow({ where: { id } })).startingPrice.toFixed(4),
      ).toBe('250.0000');
      await Promise.all([
        request(server)
          .patch(`/api/v1/developer/projects/${id}/units/${first.id}`)
          .set('Authorization', `Bearer ${developerToken}`)
          .send({ expectedVersion: first.version, price: '100' })
          .expect(200),
        request(server)
          .patch(`/api/v1/developer/projects/${id}/units/${second.id}`)
          .set('Authorization', `Bearer ${developerToken}`)
          .send({ expectedVersion: second.version, status: 'SOLD' })
          .expect(200),
      ]);
      await request(server)
        .post(`/api/v1/developer/projects/${id}/units`)
        .set('Authorization', `Bearer ${developerToken}`)
        .send({ unitNumber: 'USD', roomType: '2+1', netArea: '80', price: '1', currency: 'USD' })
        .expect(201);
      const summary = await prisma.project.findUniqueOrThrow({ where: { id } });
      expect(summary.startingPrice.toFixed(4)).toBe('100.0000');
      expect(summary.priceUpdatedAt).not.toBeNull();
      await request(server)
        .patch(`/api/v1/developer/projects/${id}/units/${first.id}`)
        .set('Authorization', `Bearer ${developerToken}`)
        .send({ expectedVersion: first.version + 1, status: 'SOLD' })
        .expect(200);
      const empty = await prisma.project.findUniqueOrThrow({ where: { id } });
      expect(empty.startingPrice.toFixed(4)).toBe('100.0000');
      expect(empty.priceUpdatedAt).toBeNull();
    } finally {
      await Promise.allSettled(writes);
    }
  });

  it('returns stale-version409 before invalid-transition422 without extra writes or audits', async () => {
    const created = await request(server)
      .post(`/api/v1/projects/${project!.id}/leads`)
      .set('Authorization', `Bearer ${buyerToken}`)
      .set('Idempotency-Key', randomUUID())
      .send(leadBody())
      .expect(201);
    const lead = created.body as LeadResponseDto;
    await request(server)
      .patch(`/api/v1/developer/leads/${lead.id}`)
      .set('Authorization', `Bearer ${developerToken}`)
      .send({ expectedVersion: lead.version, status: 'CLOSED', closedReason: 'Test complete' })
      .expect(200);
    const auditCount = await prisma.auditLog.count({ where: { entityId: lead.id } });
    const stale = await request(server)
      .patch(`/api/v1/developer/leads/${lead.id}`)
      .set('Authorization', `Bearer ${developerToken}`)
      .send({ expectedVersion: lead.version, status: 'CONTACTED' })
      .expect(409);
    expect(stale.body).toMatchObject({ code: 'LEAD_CONCURRENCY_CONFLICT' });
    await request(server)
      .patch(`/api/v1/developer/leads/${lead.id}`)
      .set('Authorization', `Bearer ${developerToken}`)
      .send({ expectedVersion: lead.version + 1, status: 'CONTACTED' })
      .expect(422);
    expect(await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).toMatchObject({
      status: 'CLOSED',
      version: lead.version + 1,
    });
    expect(await prisma.auditLog.count({ where: { entityId: lead.id } })).toBe(auditCount);
  });

  it('persists private plan context, replays one lead and rejects a different project plan', async () => {
    const id = project!.id;
    const plan = await prisma.paymentPlan.create({
      data: {
        projectId: id,
        name: 'Selected plan',
        downPaymentPercent: '30',
        deliveryPercent: '20',
        termMonths: 24,
      },
    });
    const foreignPlan = await prisma.paymentPlan.findFirstOrThrow({
      where: { projectId: source.id },
    });
    const body = {
      ...leadBody(),
      paymentPlanId: plan.id,
      message: 'Confirm delivery payment and fees.',
    };
    const key = randomUUID();
    const submit = (payload: typeof body, idempotencyKey = key): request.Test =>
      request(server)
        .post(`/api/v1/projects/${id}/leads`)
        .set('Authorization', `Bearer ${buyerToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(payload);
    const created = (await submit(body).expect(201)).body as LeadResponseDto;
    expect(created).toMatchObject({
      paymentPlanId: plan.id,
      paymentPlanName: plan.name,
      message: body.message,
    });
    await prisma.paymentPlan.update({ where: { id: plan.id }, data: { name: 'Renamed later' } });
    expect((await submit(body).expect(201)).body).toMatchObject({
      id: created.id,
      paymentPlanName: 'Selected plan',
    });
    await submit({ ...body, message: 'Changed question' }).expect(409);
    const invalid = await submit({ ...body, paymentPlanId: foreignPlan.id }, randomUUID()).expect(
      422,
    );
    expect(invalid.body).toMatchObject({ code: 'LEAD_PAYMENT_PLAN_NOT_FOUND' });
    expect(await prisma.lead.count({ where: { projectId: id } })).toBe(1);
    const queue = await request(server)
      .get(`/api/v1/developer/leads?projectId=${id}`)
      .set('Authorization', `Bearer ${developerToken}`)
      .expect('Cache-Control', 'private, no-store')
      .expect(200);
    expect(queue.body).toMatchObject({
      items: [
        expect.objectContaining({ id: created.id, message: body.message, phone: body.phone }),
      ],
    });
    await request(server)
      .get('/api/v1/developer/leads')
      .set('Authorization', `Bearer ${buyerToken}`)
      .expect(403);
    const detail = await request(server).get(`/api/v1/projects/${project!.slug}`).expect(200);
    expect(JSON.stringify(detail.body)).not.toContain(body.message);
    expect(JSON.stringify(detail.body)).not.toContain(body.phone);
  });
});
