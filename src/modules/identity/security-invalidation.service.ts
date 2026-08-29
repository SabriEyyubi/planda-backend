import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MutationContext } from '../../common/types/mutation-context';
import { PrismaService } from '../../infrastructure/database/prisma.service';

@Injectable()
export class SecurityInvalidationService {
  constructor(private readonly prisma: PrismaService) {}

  async invalidateUserSecurity(
    tx: Prisma.TransactionClient,
    userId: string,
    actorUserId: string,
    action: string,
    context: MutationContext,
  ): Promise<number> {
    const before = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { securityVersion: true },
    });
    const user = await tx.user.update({
      where: { id: userId },
      data: { securityVersion: { increment: 1 } },
      select: { securityVersion: true },
    });
    await tx.auditLog.create({
      data: {
        actorUserId,
        action,
        entityType: 'User',
        entityId: userId,
        before: { securityVersion: before.securityVersion },
        after: { securityVersion: user.securityVersion },
        ...context,
      },
    });
    return user.securityVersion;
  }

  async invalidateAllSessions(
    userId: string,
    actorUserId: string,
    action: string,
    context: MutationContext,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await this.invalidateUserSecurity(tx, userId, actorUserId, action, context);
      const now = new Date();
      await tx.authSession.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.refreshToken.updateMany({
        where: { session: { userId }, revokedAt: null },
        data: { revokedAt: now },
      });
    });
  }
}
