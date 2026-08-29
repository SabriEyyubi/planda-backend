import { Injectable } from '@nestjs/common';
import { OrganizationStatus, OrganizationType, ProjectStatus } from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { PublicDeveloperDto } from './dto/developer-response.dto';

@Injectable()
export class DevelopersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<PublicDeveloperDto[]> {
    const organizations = await this.prisma.organization.findMany({
      where: { type: OrganizationType.DEVELOPER, status: OrganizationStatus.ACTIVE },
      select: { id: true },
      orderBy: { name: 'asc' },
    });
    return Promise.all(organizations.map(({ id }) => this.byId(id)));
  }

  async detail(slug: string): Promise<PublicDeveloperDto> {
    const organization = await this.prisma.organization.findFirst({
      where: { slug, type: OrganizationType.DEVELOPER, status: OrganizationStatus.ACTIVE },
      select: { id: true },
    });
    if (!organization) throw new AppException('DEVELOPER_NOT_FOUND', 'Developer not found', 404);
    return this.byId(organization.id);
  }

  private async byId(id: string): Promise<PublicDeveloperDto> {
    const [organization, projects] = await this.prisma.$transaction([
      this.prisma.organization.findUniqueOrThrow({ where: { id } }),
      this.prisma.project.aggregate({
        where: { developerOrganizationId: id, status: ProjectStatus.PUBLISHED },
        _count: { _all: true },
        _min: { startingPrice: true },
      }),
    ]);
    const cheapest = projects._min.startingPrice;
    const currency = cheapest
      ? await this.prisma.project.findFirst({
          where: {
            developerOrganizationId: id,
            status: ProjectStatus.PUBLISHED,
            startingPrice: cheapest,
          },
          select: { currency: true },
          orderBy: { id: 'asc' },
        })
      : null;
    return {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      verifiedAt: organization.verifiedAt,
      about: organization.about,
      logoUrl: organization.logoUrl,
      publishedProjectCount: projects._count._all,
      startingPrice: cheapest?.toFixed(4) ?? null,
      currency: currency?.currency ?? null,
    };
  }
}
