import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppException } from '../../common/exceptions/app.exception';
import { PrismaService } from '../../infrastructure/database/prisma.service';
import { ProfileResponseDto, UpdateProfileDto } from './dto/profile.dto';

const profileSelect = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  preferredLanguage: true,
  preferredCurrency: true,
  createdAt: true,
  roles: { select: { role: true } },
} as const;
type ProfileUser = Prisma.UserGetPayload<{ select: typeof profileSelect }>;

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async get(userId: string): Promise<ProfileResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: profileSelect,
    });
    if (!user) throw new AppException('USER_NOT_FOUND', 'User not found', 404);
    return this.toResponse(user);
  }

  async update(userId: string, dto: UpdateProfileDto): Promise<ProfileResponseDto> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: dto,
      select: profileSelect,
    });
    return this.toResponse(user);
  }

  private toResponse(user: ProfileUser): ProfileResponseDto {
    return { ...user, roles: user.roles.map(({ role }) => role) };
  }
}
