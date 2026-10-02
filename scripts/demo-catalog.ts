import {
  OrganizationStatus,
  OrganizationType,
  Prisma,
  PrismaClient,
  ProjectStatus,
  UnitStatus,
} from '@prisma/client';
import { DEMO_NOTICE, demoPhotos, demoProjects, seedProjects } from './demo-catalog-data';

const DEMO_ORGANIZATION = 'demo-yapi';
const DEMO_ORGANIZATION_NAME = 'Demo Yapı (Demo)';

/** Validate before constructing Prisma; query parameters cannot override the host. */
export function assertIsolatedDemoEnvironment(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV?.toLowerCase() === 'production')
    throw new Error('Demo catalog is disabled in production.');
  if (env.DEMO_CATALOG_ACK !== 'isolated-local-only')
    throw new Error(
      'Set DEMO_CATALOG_ACK=isolated-local-only to acknowledge fictional local data.',
    );
  let database: URL;
  try {
    database = new URL(env.DATABASE_URL ?? '');
  } catch {
    throw new Error('A valid isolated DATABASE_URL is required.');
  }
  if (
    !['postgresql:', 'postgres:'].includes(database.protocol) ||
    !['localhost', '127.0.0.1'].includes(database.hostname) ||
    database.port !== '15432' ||
    database.pathname !== '/planda' ||
    database.hash ||
    [...database.searchParams].some(([key, value]) => key !== 'schema' || value !== 'public')
  ) {
    throw new Error(
      'Demo catalog only permits localhost or 127.0.0.1:15432/planda with optional schema=public.',
    );
  }
}

function photoAt(index: number): string {
  const photo = demoPhotos[index % demoPhotos.length];
  if (!photo) throw new Error('Demo photograph definition is missing.');
  return photo;
}

async function upsertInventory(
  tx: Prisma.TransactionClient,
  projectId: string,
  price: Prisma.Decimal,
  currency: string,
  rooms: readonly [string, string],
  existingSeed: boolean,
): Promise<void> {
  for (const [index, roomType] of rooms.entries()) {
    const unitPrice = index === 0 ? price : price.mul('1.18');
    const data = {
      block: 'A',
      floor: index + 1,
      roomType,
      netArea: index === 0 ? '86.50' : '124.00',
      grossArea: index === 0 ? '104.00' : '148.00',
      price: unitPrice,
      currency,
      status: UnitStatus.AVAILABLE,
      orientation: 'Güney',
      floorPlanImageUrl: null,
    };
    const unit = await tx.unit.upsert({
      where: { projectId_unitNumber: { projectId, unitNumber: index === 0 ? 'A-101' : 'A-204' } },
      update: data,
      create: { projectId, unitNumber: index === 0 ? 'A-101' : 'A-204', ...data },
    });
    if (existingSeed)
      await tx.brokerUnitTerm.upsert({
        where: { unitId: unit.id },
        update: { brokerPrice: unitPrice.mul('0.96') },
        create: { unitId: unit.id, brokerPrice: unitPrice.mul('0.96'), commissionPercent: '3.00' },
      });
  }
  if (!existingSeed) {
    for (const [unitNumber, status] of [
      ['B-301', UnitStatus.RESERVED],
      ['B-402', UnitStatus.SOLD],
    ] as const) {
      const data = {
        roomType: rooms[1],
        netArea: '130.00',
        grossArea: '156.00',
        price: price.mul('1.25'),
        currency,
        status,
        floorPlanImageUrl: null,
      };
      await tx.unit.upsert({
        where: { projectId_unitNumber: { projectId, unitNumber } },
        update: data,
        create: { projectId, unitNumber, ...data },
      });
    }
  }
  // 40% down + 24 installments of 2.5% = 100%, without rounding drift.
  const plan = {
    downPaymentPercent: '40.00',
    termMonths: 24,
    deliveryPercent: '0.00',
    isRecommended: true,
    monthlyPayment: price.mul('0.025'),
    totalPrice: price,
    cashDiscountPercent: '0.00',
    timelineNote:
      'DEMO — %40 peşinat ve 24 eşit taksit. Temsili koşullar; gerçek satış teklifi değildir.',
  };
  const name = existingSeed ? 'Plan A' : 'Demo 24 Ay';
  await tx.paymentPlan.upsert({
    where: { projectId_name: { projectId, name } },
    update: plan,
    create: { projectId, name, ...plan },
  });
  if (existingSeed)
    await tx.brokerOffer.updateMany({
      where: { projectId },
      data: { brokerPrice: price.mul('0.97') },
    });
}

export async function populateDemoCatalog(prisma: PrismaClient): Promise<void> {
  assertIsolatedDemoEnvironment(process.env);
  await prisma.$transaction(
    async (tx) => {
      // Fail the whole transaction before mutations if a known slug is not our seed/demo.
      const existing = await tx.project.findMany({
        where: {
          slug: {
            in: [
              ...seedProjects.map((item) => item.slug),
              ...demoProjects.map((item) => item.slug),
            ],
          },
        },
        include: { developerOrganization: true },
      });
      for (const seed of seedProjects) {
        const record = existing.find((item) => item.slug === seed.slug);
        const organizationName =
          seed.organization === 'development-yapi'
            ? 'Development Yapı (Seed)'
            : 'Capital Homes (Seed)';
        if (
          !record ||
          record.name !== seed.name ||
          record.developerOrganization.slug !== seed.organization ||
          record.developerOrganization.name !== organizationName
        )
          throw new Error(
            `Expected default seed ownership for ${seed.slug}; aborting without changes.`,
          );
      }
      const organization = await tx.organization.findUnique({ where: { slug: DEMO_ORGANIZATION } });
      if (
        organization &&
        (organization.name !== DEMO_ORGANIZATION_NAME ||
          organization.about !== DEMO_NOTICE ||
          organization.type !== OrganizationType.DEVELOPER)
      )
        throw new Error('demo-yapi belongs to non-demo data; aborting.');
      for (const demo of demoProjects) {
        const record = existing.find((item) => item.slug === demo.slug);
        if (
          record &&
          (record.developerOrganizationId !== organization?.id ||
            record.name !== demo.name ||
            !record.summary?.startsWith(DEMO_NOTICE))
        )
          throw new Error(`Demo slug collision: ${demo.slug}; aborting.`);
      }
      const demoOrganization = await tx.organization.upsert({
        where: { slug: DEMO_ORGANIZATION },
        update: {},
        create: {
          slug: DEMO_ORGANIZATION,
          name: DEMO_ORGANIZATION_NAME,
          type: OrganizationType.DEVELOPER,
          status: OrganizationStatus.ACTIVE,
          about: DEMO_NOTICE,
        },
      });
      for (const [index, seed] of seedProjects.entries()) {
        const record = existing.find((item) => item.slug === seed.slug)!;
        await tx.project.update({
          where: { id: record.id },
          data: {
            heroImageUrl: photoAt(index),
            summary: `${DEMO_NOTICE} Katalog, filtre ve karşılaştırma akışlarını deneyimlemek için hazırlanmıştır.`,
          },
        });
        await upsertInventory(
          tx,
          record.id,
          record.startingPrice,
          record.currency,
          ['1+1', '2+1'],
          true,
        );
      }
      for (const demo of demoProjects) {
        const province = await tx.province.upsert({
          where: { code: demo.province.code },
          update: {},
          create: demo.province,
        });
        const district = await tx.district.upsert({
          where: { code: demo.district.code },
          update: {},
          create: { ...demo.district, provinceId: province.id },
        });
        if (district.provinceId !== province.id)
          throw new Error(`District ownership mismatch: ${demo.district.code}.`);
        const data = {
          name: demo.name,
          developerOrganizationId: demoOrganization.id,
          status: ProjectStatus.PUBLISHED,
          provinceId: province.id,
          districtId: district.id,
          latitude: demo.latitude,
          longitude: demo.longitude,
          startingPrice: demo.price,
          currency: demo.currency,
          deliveryDate: demo.deliveryDate ? new Date(`${demo.deliveryDate}T00:00:00.000Z`) : null,
          constructionStatus: demo.constructionStatus,
          heroImageUrl: photoAt(demo.photo),
          summary: `${DEMO_NOTICE} ${demo.summary}`,
        };
        const project = await tx.project.upsert({
          where: { slug: demo.slug },
          update: data,
          create: { slug: demo.slug, ...data },
        });
        await upsertInventory(
          tx,
          project.id,
          new Prisma.Decimal(demo.price),
          demo.currency,
          demo.rooms,
          false,
        );
      }
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 },
  );
}

async function main(): Promise<void> {
  assertIsolatedDemoEnvironment(process.env);
  const prisma = new PrismaClient();
  try {
    await populateDemoCatalog(prisma);
    console.log(
      'DEMO catalog ready: 6 existing seed projects enhanced + 9 fictional demo projects. All photography is illustrative. No users or credentials changed.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    // Avoid printing Prisma errors or connection strings containing secrets.
    console.error(
      error instanceof Prisma.PrismaClientKnownRequestError ||
        error instanceof Prisma.PrismaClientInitializationError
        ? 'Demo catalog failed; transaction rolled back. Check the isolated database and retry.'
        : error instanceof Error
          ? error.message
          : 'Demo catalog failed.',
    );
    process.exitCode = 1;
  });
}
