import { ApiProperty } from '@nestjs/swagger';
import { ConstructionStatus, ProjectStatus } from '@prisma/client';

export class ProjectLocationReferenceDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
}

export class ProjectResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) developerOrganizationId!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() developerName!: string;
  @ApiProperty() developerVerified!: boolean;
  @ApiProperty({ enum: ProjectStatus }) status!: ProjectStatus;
  @ApiProperty({ enum: ConstructionStatus }) constructionStatus!: ConstructionStatus;
  @ApiProperty({ type: ProjectLocationReferenceDto }) province!: ProjectLocationReferenceDto;
  @ApiProperty({ type: ProjectLocationReferenceDto }) district!: ProjectLocationReferenceDto;
  @ApiProperty({ example: '40.990868' }) latitude!: string;
  @ApiProperty({ example: '29.027707' }) longitude!: string;
  @ApiProperty({ example: '7500000.0000' }) startingPrice!: string;
  @ApiProperty({ example: 'TRY' }) currency!: string;
  @ApiProperty({ type: String, format: 'date', nullable: true }) deliveryDate!: string | null;
  @ApiProperty({ type: String, nullable: true }) summary!: string | null;
  @ApiProperty({ type: String, nullable: true }) heroImageUrl!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  stockUpdatedAt!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  priceUpdatedAt!: string | null;
  @ApiProperty({ format: 'date-time' }) createdAt!: string;
  @ApiProperty({ format: 'date-time' }) updatedAt!: string;
  @ApiProperty() version!: number;
}

export class ProjectUnitTypeDto {
  @ApiProperty() roomType!: string;
  @ApiProperty() availableCount!: number;
  @ApiProperty() minNetArea!: string;
  @ApiProperty() maxNetArea!: string;
  @ApiProperty() startingPrice!: string;
  @ApiProperty() currency!: string;
  @ApiProperty({ type: Number, nullable: true }) minFloor!: number | null;
  @ApiProperty({ type: Number, nullable: true }) maxFloor!: number | null;
  @ApiProperty({ type: [String] }) orientations!: string[];
  @ApiProperty({ type: String, nullable: true }) floorPlanImageUrl!: string | null;
}

export class PublicPaymentPlanDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() downPaymentPercent!: string;
  @ApiProperty() termMonths!: number;
  @ApiProperty() deliveryPercent!: string;
  @ApiProperty() isRecommended!: boolean;
  @ApiProperty({ type: String, nullable: true }) monthlyPayment!: string | null;
  @ApiProperty({ type: String, nullable: true }) totalPrice!: string | null;
  @ApiProperty({ type: String, nullable: true }) cashDiscountPercent!: string | null;
  @ApiProperty({ type: String, nullable: true }) timelineNote!: string | null;
}

export class PublicProjectMediaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: ['IMAGE'] }) kind!: 'IMAGE';
  @ApiProperty() url!: string;
  @ApiProperty({ type: String, nullable: true }) altText!: string | null;
}

export class PublicProjectAmenityDto {
  @ApiProperty() code!: string;
  @ApiProperty() label!: string;
}

export class PublicProjectPointOfInterestDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() category!: string;
  @ApiProperty() distanceMeters!: number;
}

export class ProjectDetailResponseDto extends ProjectResponseDto {
  @ApiProperty({ type: [ProjectUnitTypeDto] }) unitTypes!: ProjectUnitTypeDto[];
  @ApiProperty({ type: [PublicPaymentPlanDto] }) paymentPlans!: PublicPaymentPlanDto[];
  @ApiProperty({ type: [PublicProjectMediaDto] }) media!: PublicProjectMediaDto[];
  @ApiProperty({ type: [PublicProjectAmenityDto] }) amenities!: PublicProjectAmenityDto[];
  @ApiProperty({ type: [PublicProjectPointOfInterestDto] })
  pointsOfInterest!: PublicProjectPointOfInterestDto[];
  @ApiProperty() availableUnitCount!: number;
}

class PageInfoDto {
  @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
  @ApiProperty() hasNextPage!: boolean;
}

export class ProjectListResponseDto {
  @ApiProperty({ type: [ProjectResponseDto] }) items!: ProjectResponseDto[];
  @ApiProperty({ type: PageInfoDto }) pageInfo!: PageInfoDto;
}
