import {
  ConstructionStatus,
  MembershipRole,
  OrganizationStatus,
  OrganizationType,
  PlatformRole,
  PreferredLanguage,
  Prisma,
  PrismaClient,
  ProjectStatus,
  UnitStatus,
} from '@prisma/client';
import { hash } from 'argon2';

const prisma = new PrismaClient();
const DEVELOPMENT_PASSWORD = 'DevelopmentOnly!123';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production')
    throw new Error('Development seed is disabled in production');
  const passwordHash = await hash(DEVELOPMENT_PASSWORD);
  const organization = await prisma.organization.upsert({
    where: { slug: 'development-yapi' },
    update: {
      about: 'İstanbul odaklı, doğrulanmış konut geliştiricisi.',
      logoUrl: 'https://placehold.co/320x120/png?text=Development+Yapi',
    },
    create: {
      name: 'Development Yapı (Seed)',
      slug: 'development-yapi',
      type: OrganizationType.DEVELOPER,
      status: OrganizationStatus.ACTIVE,
      verifiedAt: new Date(),
      about: 'İstanbul odaklı, doğrulanmış konut geliştiricisi.',
      logoUrl: 'https://placehold.co/320x120/png?text=Development+Yapi',
    },
  });
  const capitalOrganization = await prisma.organization.upsert({
    where: { slug: 'capital-homes' },
    update: {
      about: 'Ankara’da erişilebilir ve ulaşım odaklı konut projeleri geliştirir.',
      logoUrl: 'https://placehold.co/320x120/png?text=Capital+Homes',
    },
    create: {
      name: 'Capital Homes (Seed)',
      slug: 'capital-homes',
      type: OrganizationType.DEVELOPER,
      status: OrganizationStatus.ACTIVE,
      verifiedAt: new Date(),
      about: 'Ankara’da erişilebilir ve ulaşım odaklı konut projeleri geliştirir.',
      logoUrl: 'https://placehold.co/320x120/png?text=Capital+Homes',
    },
  });
  const admin = await prisma.user.upsert({
    where: { email: 'admin@planda.test' },
    update: {
      passwordHash,
      fullName: 'Planda Admin',
      preferredLanguage: PreferredLanguage.TR,
      preferredCurrency: 'TRY',
    },
    create: {
      email: 'admin@planda.test',
      passwordHash,
      fullName: 'Planda Admin',
      preferredLanguage: PreferredLanguage.TR,
      preferredCurrency: 'TRY',
    },
  });
  await prisma.userPlatformRole.upsert({
    where: { userId_role: { userId: admin.id, role: PlatformRole.ADMIN } },
    update: {},
    create: { userId: admin.id, role: PlatformRole.ADMIN },
  });
  const developer = await prisma.user.upsert({
    where: { email: 'developer@planda.test' },
    update: {
      passwordHash,
      fullName: 'Deniz Developer',
      phone: '+905551112201',
      preferredLanguage: PreferredLanguage.TR,
      preferredCurrency: 'TRY',
    },
    create: {
      email: 'developer@planda.test',
      passwordHash,
      fullName: 'Deniz Developer',
      phone: '+905551112201',
      preferredLanguage: PreferredLanguage.TR,
      preferredCurrency: 'TRY',
    },
  });
  await prisma.userPlatformRole.upsert({
    where: { userId_role: { userId: developer.id, role: PlatformRole.DEVELOPER_MEMBER } },
    update: {},
    create: { userId: developer.id, role: PlatformRole.DEVELOPER_MEMBER },
  });
  await prisma.organizationMembership.upsert({
    where: { userId_organizationId: { userId: developer.id, organizationId: organization.id } },
    update: { role: MembershipRole.OWNER },
    create: { userId: developer.id, organizationId: organization.id, role: MembershipRole.OWNER },
  });
  for (const definition of [
    {
      email: 'buyer@planda.test',
      role: PlatformRole.BUYER,
      fullName: 'Buse Buyer',
      phone: '+905551112202',
    },
    {
      email: 'broker@planda.test',
      role: PlatformRole.BROKER,
      fullName: 'Bora Broker',
      phone: '+905551112203',
    },
  ]) {
    const user = await prisma.user.upsert({
      where: { email: definition.email },
      update: {
        passwordHash,
        fullName: definition.fullName,
        phone: definition.phone,
        preferredLanguage: PreferredLanguage.TR,
        preferredCurrency: 'TRY',
      },
      create: {
        email: definition.email,
        passwordHash,
        fullName: definition.fullName,
        phone: definition.phone,
        preferredLanguage: PreferredLanguage.TR,
        preferredCurrency: 'TRY',
      },
    });
    await prisma.userPlatformRole.upsert({
      where: { userId_role: { userId: user.id, role: definition.role } },
      update: {},
      create: { userId: user.id, role: definition.role },
    });
  }
  const brokerAgency = await prisma.organization.upsert({
    where: { slug: 'planda-broker-agency' },
    update: {},
    create: {
      name: 'Planda Broker Agency (Seed)',
      slug: 'planda-broker-agency',
      type: OrganizationType.BROKER_AGENCY,
      status: OrganizationStatus.ACTIVE,
    },
  });
  const brokerUser = await prisma.user.findUniqueOrThrow({
    where: { email: 'broker@planda.test' },
  });
  await prisma.organizationMembership.upsert({
    where: { userId_organizationId: { userId: brokerUser.id, organizationId: brokerAgency.id } },
    update: { role: MembershipRole.OWNER },
    create: { userId: brokerUser.id, organizationId: brokerAgency.id, role: MembershipRole.OWNER },
  });
  const province = await prisma.province.upsert({
    where: { code: 'TR-34' },
    update: {},
    create: { code: 'TR-34', name: 'İstanbul', slug: 'istanbul' },
  });
  const districtDefinitions = [
    { code: 'TR-34-USKUDAR', name: 'Üsküdar', slug: 'uskudar' },
    { code: 'TR-34-KADIKOY', name: 'Kadıköy', slug: 'kadikoy' },
    { code: 'TR-34-ATASEHIR', name: 'Ataşehir', slug: 'atasehir' },
  ];
  const districts = new Map<string, string>();
  for (const definition of districtDefinitions) {
    const district = await prisma.district.upsert({
      where: { code: definition.code },
      update: {},
      create: { ...definition, provinceId: province.id },
    });
    districts.set(definition.name, district.id);
  }
  const ankara = await prisma.province.upsert({
    where: { code: 'TR-06' },
    update: {},
    create: { code: 'TR-06', name: 'Ankara', slug: 'ankara' },
  });
  for (const definition of [
    { code: 'TR-06-CANKAYA', name: 'Çankaya', slug: 'cankaya' },
    { code: 'TR-06-ETIMESGUT', name: 'Etimesgut', slug: 'etimesgut' },
    { code: 'TR-06-KECIOREN', name: 'Keçiören', slug: 'kecioren' },
  ]) {
    const district = await prisma.district.upsert({
      where: { code: definition.code },
      update: {},
      create: { ...definition, provinceId: ankara.id },
    });
    districts.set(definition.name, district.id);
  }
  const samples = [
    {
      name: 'Seed Bosphorus',
      slug: 'seed-bosphorus',
      status: ProjectStatus.PUBLISHED,
      district: 'Üsküdar',
      price: '12500000.0000',
      provinceId: province.id,
      organizationId: organization.id,
      latitude: '41.025700',
      longitude: '29.015000',
      deliveryDate: '2027-09-30',
    },
    {
      name: 'Seed Park',
      slug: 'seed-park',
      status: ProjectStatus.PUBLISHED,
      district: 'Kadıköy',
      price: '8400000.0000',
      provinceId: province.id,
      organizationId: organization.id,
      latitude: '40.990900',
      longitude: '29.028900',
      deliveryDate: '2028-03-31',
    },
    {
      name: 'Seed Garden',
      slug: 'seed-garden',
      status: ProjectStatus.PUBLISHED,
      district: 'Ataşehir',
      price: '6750000.0000',
      provinceId: province.id,
      organizationId: organization.id,
      latitude: '40.983300',
      longitude: '29.127800',
      deliveryDate: '2026-12-31',
    },
    {
      name: 'Capital Vista',
      slug: 'capital-vista',
      status: ProjectStatus.PUBLISHED,
      district: 'Çankaya',
      price: '7900000.0000',
      provinceId: ankara.id,
      organizationId: capitalOrganization.id,
      latitude: '39.897900',
      longitude: '32.866300',
      deliveryDate: '2027-06-30',
    },
    {
      name: 'Capital Metro',
      slug: 'capital-metro',
      status: ProjectStatus.PUBLISHED,
      district: 'Etimesgut',
      price: '5250000.0000',
      provinceId: ankara.id,
      organizationId: capitalOrganization.id,
      latitude: '39.948900',
      longitude: '32.669600',
      deliveryDate: '2026-10-31',
    },
    {
      name: 'Capital North',
      slug: 'capital-north',
      status: ProjectStatus.PUBLISHED,
      district: 'Keçiören',
      price: '4600000.0000',
      provinceId: ankara.id,
      organizationId: capitalOrganization.id,
      latitude: '40.021100',
      longitude: '32.831000',
      deliveryDate: '2028-12-31',
    },
  ];
  for (const sample of samples) {
    const project = await prisma.project.upsert({
      where: { slug: sample.slug },
      update: {
        developerOrganizationId: sample.organizationId,
        status: sample.status,
        provinceId: sample.provinceId,
        districtId: districts.get(sample.district)!,
        latitude: sample.latitude,
        longitude: sample.longitude,
        startingPrice: sample.price,
        deliveryDate: new Date(sample.deliveryDate),
        heroImageUrl: `https://placehold.co/1200x800/png?text=${encodeURIComponent(sample.name)}`,
        stockUpdatedAt: new Date(),
        priceUpdatedAt: new Date(),
        constructionStatus:
          sample.status === ProjectStatus.PUBLISHED
            ? ConstructionStatus.UNDER_CONSTRUCTION
            : ConstructionStatus.PLANNED,
      },
      create: {
        developerOrganizationId: sample.organizationId,
        name: sample.name,
        slug: sample.slug,
        status: sample.status,
        provinceId: sample.provinceId,
        districtId: districts.get(sample.district)!,
        latitude: sample.latitude,
        longitude: sample.longitude,
        startingPrice: sample.price,
        currency: 'TRY',
        deliveryDate: new Date(sample.deliveryDate),
        heroImageUrl: `https://placehold.co/1200x800/png?text=${encodeURIComponent(sample.name)}`,
        summary:
          'Metro bağlantılarına yakın, güncel stok ve geliştirici kaynaklı ödeme planları sunan yeni konut projesi.',
        stockUpdatedAt: new Date(),
        priceUpdatedAt: new Date(),
        constructionStatus:
          sample.status === ProjectStatus.PUBLISHED
            ? ConstructionStatus.UNDER_CONSTRUCTION
            : ConstructionStatus.PLANNED,
      },
    });
    if (sample.status === ProjectStatus.PUBLISHED) {
      for (const unit of [
        {
          unitNumber: 'A-101',
          block: 'A',
          floor: 1,
          roomType: '1+1',
          netArea: '62.50',
          grossArea: '78.00',
          price: '12500000.0000',
          status: UnitStatus.AVAILABLE,
          orientation: 'Güney',
          floorPlanImageUrl: 'https://assets.example.test/planda/floorplans/1-plus-1.png',
        },
        {
          unitNumber: 'A-204',
          block: 'A',
          floor: 2,
          roomType: '2+1',
          netArea: '86.50',
          grossArea: '104.00',
          price: '14800000.0000',
          status: UnitStatus.AVAILABLE,
          orientation: 'Güneybatı',
          floorPlanImageUrl: 'https://assets.example.test/planda/floorplans/2-plus-1.png',
        },
      ]) {
        const seededUnit = await prisma.unit.upsert({
          where: {
            projectId_unitNumber: { projectId: project.id, unitNumber: unit.unitNumber },
          },
          update: unit,
          create: { projectId: project.id, currency: 'TRY', ...unit },
        });
        await prisma.brokerUnitTerm.upsert({
          where: { unitId: seededUnit.id },
          update: {
            brokerPrice: new Prisma.Decimal(unit.price).mul('0.96').toFixed(4),
            commissionPercent: unit.roomType === '1+1' ? '3.00' : '3.50',
          },
          create: {
            unitId: seededUnit.id,
            brokerPrice: new Prisma.Decimal(unit.price).mul('0.96').toFixed(4),
            commissionPercent: unit.roomType === '1+1' ? '3.00' : '3.50',
          },
        });
      }
      await prisma.paymentPlan.upsert({
        where: { projectId_name: { projectId: project.id, name: 'Plan A' } },
        update: {
          monthlyPayment: '291666.0000',
          totalPrice: '10000000.0000',
          cashDiscountPercent: '10.00',
          timelineNote: '24 eşit taksit; teslimde ek ödeme yok.',
        },
        create: {
          projectId: project.id,
          name: 'Plan A',
          downPaymentPercent: '30.00',
          termMonths: 24,
          deliveryPercent: '0.00',
          isRecommended: true,
          monthlyPayment: '291666.0000',
          totalPrice: '10000000.0000',
          cashDiscountPercent: '10.00',
          timelineNote: '24 eşit taksit; teslimde ek ödeme yok.',
        },
      });
      await prisma.brokerOffer.upsert({
        where: { projectId: project.id },
        update: { enabled: true },
        create: {
          projectId: project.id,
          enabled: true,
          brokerPrice: '12125000.0000',
          commissionPercent: '3.00',
          reservationHours: 24,
          salesContact: 'Seed sales desk',
        },
      });
      await prisma.projectMaterial.upsert({
        where: { id: '83000000-0000-4000-8000-000000000001' },
        update: {
          title: 'Broker price list',
          kind: 'XLSX',
          language: 'EN',
          versionLabel: 'v14',
          fileSizeBytes: BigInt(184320),
        },
        create: {
          id: '83000000-0000-4000-8000-000000000001',
          projectId: project.id,
          title: 'Broker price list',
          kind: 'XLSX',
          downloadUrl: 'internal://materials/seed-bosphorus-price-list-v14',
          language: 'EN',
          versionLabel: 'v14',
          fileSizeBytes: BigInt(184320),
        },
      });
      await prisma.projectMedia.deleteMany({
        where: {
          id: {
            in: ['81000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000002'],
          },
        },
      });
      for (const amenity of [
        { code: 'METRO_NEARBY', label: 'Metroya yakın' },
        { code: 'PARKING', label: 'Otopark' },
        { code: 'SECURITY', label: 'Güvenlik' },
      ]) {
        await prisma.projectAmenity.upsert({
          where: { projectId_code: { projectId: project.id, code: amenity.code } },
          update: { label: amenity.label },
          create: { projectId: project.id, ...amenity },
        });
      }
      await prisma.projectPointOfInterest.upsert({
        where: { id: '82000000-0000-4000-8000-000000000001' },
        update: { name: 'Metro', category: 'TRANSIT', distanceMeters: 950 },
        create: {
          id: '82000000-0000-4000-8000-000000000001',
          projectId: project.id,
          name: 'Metro',
          category: 'TRANSIT',
          distanceMeters: 950,
        },
      });
    }
  }
  console.log(
    'Development seed complete. Users: admin, developer, buyer, broker @planda.test — password: DevelopmentOnly!123',
  );
}

void main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
