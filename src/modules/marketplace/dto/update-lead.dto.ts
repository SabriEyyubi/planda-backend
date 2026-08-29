import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeadStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class UpdateLeadDto {
  @ApiProperty({ enum: LeadStatus }) @IsEnum(LeadStatus) status!: LeadStatus;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) expectedVersion!: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  closedReason?: string;
}
