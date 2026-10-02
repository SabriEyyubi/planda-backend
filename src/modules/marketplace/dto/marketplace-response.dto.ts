import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeadStatus, PreferredLanguage, UnitStatus } from '@prisma/client';

export class LeadResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) projectId!: string;
  @ApiProperty() projectName!: string;
  @ApiProperty() fullName!: string;
  @ApiProperty() phone!: string;
  @ApiPropertyOptional({ nullable: true }) email!: string | null;
  @ApiProperty({ enum: PreferredLanguage }) preferredLanguage!: PreferredLanguage;
  @ApiPropertyOptional({ nullable: true }) unitPreference!: string | null;
  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true }) paymentPlanId!:
    string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) paymentPlanName!: string | null;
  @ApiPropertyOptional({ type: String, maxLength: 1000, nullable: true }) message!: string | null;
  @ApiPropertyOptional({ nullable: true }) budgetMin!: string | null;
  @ApiPropertyOptional({ nullable: true }) budgetMax!: string | null;
  @ApiProperty() currency!: string;
  @ApiPropertyOptional({ nullable: true }) closedReason!: string | null;
  @ApiProperty({ enum: LeadStatus }) status!: LeadStatus;
  @ApiProperty() version!: number;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class UnitResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() unitNumber!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) block!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) floor!: number | null;
  @ApiProperty() roomType!: string;
  @ApiProperty() netArea!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) grossArea!: string | null;
  @ApiProperty() price!: string;
  @ApiProperty() currency!: string;
  @ApiProperty({ enum: UnitStatus }) status!: UnitStatus;
  @ApiPropertyOptional({ type: String, nullable: true }) orientation!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) floorPlanImageUrl!: string | null;
  @ApiProperty() version!: number;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class PaymentPlanResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() downPaymentPercent!: string;
  @ApiProperty() termMonths!: number;
  @ApiProperty() deliveryPercent!: string;
  @ApiProperty() isRecommended!: boolean;
  @ApiPropertyOptional({ nullable: true }) monthlyPayment!: string | null;
  @ApiPropertyOptional({ nullable: true }) totalPrice!: string | null;
  @ApiPropertyOptional({ nullable: true }) cashDiscountPercent!: string | null;
  @ApiPropertyOptional({ nullable: true }) timelineNote!: string | null;
  @ApiProperty() version!: number;
}

export class OperationsPageInfoDto {
  @ApiPropertyOptional({ nullable: true }) nextCursor!: string | null;
  @ApiProperty() hasNextPage!: boolean;
}

export class UnitListResponseDto {
  @ApiProperty({ type: [UnitResponseDto] }) items!: UnitResponseDto[];
  @ApiProperty({ type: OperationsPageInfoDto }) pageInfo!: OperationsPageInfoDto;
}

export class LeadListResponseDto {
  @ApiProperty({ type: [LeadResponseDto] }) items!: LeadResponseDto[];
  @ApiProperty({ type: OperationsPageInfoDto }) pageInfo!: OperationsPageInfoDto;
}

export class SavedProjectResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty() district!: string;
  @ApiProperty() province!: string;
  @ApiProperty() startingPrice!: string;
  @ApiProperty() currency!: string;
  @ApiPropertyOptional({ nullable: true }) heroImageUrl!: string | null;
  @ApiProperty({ format: 'date-time' }) savedAt!: string;
}

export class BrokerProjectResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
  @ApiProperty() developerName!: string;
  @ApiProperty() publicStartingPrice!: string;
  @ApiProperty({ description: 'Currency of publicStartingPrice and the project brokerPrice' })
  currency!: string;
  @ApiPropertyOptional({ type: String, nullable: true }) brokerPrice!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) commissionPercent!: string | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) reservationHours!: number | null;
  @ApiPropertyOptional({ type: String, nullable: true }) salesContact!: string | null;
  @ApiProperty({ type: () => [BrokerUnitResponseDto] })
  units!: BrokerUnitResponseDto[];
  @ApiProperty() materialCount!: number;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}

export class BrokerUnitResponseDto extends UnitResponseDto {
  @ApiPropertyOptional({ type: String, nullable: true }) brokerPrice!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) commissionPercent!: string | null;
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  brokerTermsUpdatedAt!: string | null;
}

export class BrokerMaterialMetadataDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() title!: string;
  @ApiProperty() kind!: string;
  @ApiProperty({ enum: PreferredLanguage }) language!: PreferredLanguage;
  @ApiProperty() version!: string;
  @ApiPropertyOptional({ nullable: true, description: 'Decimal string' }) fileSizeBytes!:
    string | null;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
}
