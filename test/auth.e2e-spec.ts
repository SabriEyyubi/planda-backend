import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PlatformRole } from '@prisma/client';
import { Server } from 'node:http';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { AuthUserDto, TokenPairDto } from '../src/modules/identity/dto/auth-response.dto';

describe('authentication flow (e2e)', () => {
  let app: INestApplication;
  const email = `e2e-${Date.now()}@example.test`;
  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });
  afterAll(async () => app.close());
  it('registers, logs in, and gets the current user with a bearer token', async () => {
    const server = app.getHttpServer() as Server;
    await request(server)
      .post('/api/v1/auth/register')
      .send({ email, password: 'E2eDevelopment!123' })
      .expect(201);
    const login = await request(server)
      .post('/api/v1/auth/login')
      .send({ email, password: 'E2eDevelopment!123' })
      .expect(200);
    const loginBody = login.body as TokenPairDto;
    const me = await request(server)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${loginBody.accessToken}`)
      .expect(200);
    const meBody = me.body as AuthUserDto;
    expect(meBody.email).toBe(email);
    expect(meBody.roles).toEqual([PlatformRole.BUYER]);
    expect(meBody.organizationMemberships).toEqual([]);

    const profile = await request(server)
      .patch('/api/v1/me/profile')
      .set('Authorization', `Bearer ${loginBody.accessToken}`)
      .send({
        fullName: 'E2E Buyer',
        phone: '00 90 555 111 2299',
        preferredLanguage: 'EN',
        preferredCurrency: 'usd',
      })
      .expect('Cache-Control', 'private, no-store')
      .expect(200);
    expect(profile.body).toMatchObject({
      email,
      fullName: 'E2E Buyer',
      phone: '+905551112299',
      preferredLanguage: 'EN',
      preferredCurrency: 'USD',
      roles: [PlatformRole.BUYER],
    });
    expect(profile.body).not.toHaveProperty('passwordHash');

    await request(server)
      .patch('/api/v1/me/profile')
      .set('Authorization', `Bearer ${loginBody.accessToken}`)
      .send({ email: 'attacker@example.test' })
      .expect(400);
  });

  it('serves public city and developer catalogs without private fields', async () => {
    const server = app.getHttpServer() as Server;
    const cities = await request(server)
      .get('/api/v1/locations/cities')
      .expect('Cache-Control', /public/)
      .expect(200);
    const cityBody = cities.body as Array<Record<string, unknown>>;
    const istanbul = cityBody.find(({ slug }) => slug === 'istanbul');
    const ankara = cityBody.find(({ slug }) => slug === 'ankara');
    expect(typeof istanbul?.publishedProjectCount).toBe('number');
    expect(typeof ankara?.publishedProjectCount).toBe('number');
    await request(server).get('/api/v1/locations/cities/not-a-city').expect(404);

    const developers = await request(server)
      .get('/api/v1/developers')
      .expect('Cache-Control', /public/)
      .expect(200);
    const developerBody = developers.body as Array<Record<string, unknown>>;
    expect(developerBody).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: 'development-yapi', publishedProjectCount: 3 }),
        expect.objectContaining({ slug: 'capital-homes', publishedProjectCount: 3 }),
      ]),
    );
    expect(JSON.stringify(developerBody)).not.toContain('memberships');
    await request(server).get('/api/v1/developers/not-a-developer').expect(404);
  });
});
