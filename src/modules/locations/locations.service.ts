import { Injectable } from '@nestjs/common';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { ProjectStatus } from '@prisma/client';
import { CityCatalogDto, LocationReferenceDto } from './dto/location-response.dto';

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  listProvinces(): Promise<LocationReferenceDto[]> {
    return this.prisma.province.findMany({
      select: { id: true, code: true, name: true, slug: true },
      orderBy: { name: 'asc' },
    });
  }

  async listDistricts(provinceId: string): Promise<LocationReferenceDto[]> {
    const province = await this.prisma.province.findUnique({
      where: { id: provinceId },
      select: { id: true },
    });
    if (!province) throw new AppException('PROVINCE_NOT_FOUND', 'Province not found', 404);
    return this.prisma.district.findMany({
      where: { provinceId },
      select: { id: true, code: true, name: true, slug: true },
      orderBy: { name: 'asc' },
    });
  }

  async listCities(): Promise<CityCatalogDto[]> {
    const provinces = await this.prisma.province.findMany({ orderBy: { name: 'asc' } });
    return Promise.all(provinces.map(({ id }) => this.cityById(id)));
  }

  async city(slug: string): Promise<CityCatalogDto> {
    const province = await this.prisma.province.findUnique({ where: { slug } });
    if (!province) throw new AppException('CITY_NOT_FOUND', 'City not found', 404);
    return this.cityById(province.id);
  }

  private async cityById(id: string): Promise<CityCatalogDto> {
    const groupedProjects = this.prisma.project.groupBy({
      by: ['currency'],
      where: { provinceId: id, status: ProjectStatus.PUBLISHED },
      _count: { _all: true },
      _min: { startingPrice: true },
    });
    const [province, projects] = await this.prisma.$transaction([
      this.prisma.province.findUniqueOrThrow({ where: { id } }),
      groupedProjects,
    ]);
    const singleCurrency = projects.length === 1 ? projects[0] : undefined;
    return {
      id: province.id,
      code: province.code,
      name: province.name,
      slug: province.slug,
      publishedProjectCount: projects.reduce((count, group) => count + group._count._all, 0),
      startingPrice: singleCurrency?._min.startingPrice?.toFixed(4) ?? null,
      currency: singleCurrency?.currency ?? null,
    };
  }
}
