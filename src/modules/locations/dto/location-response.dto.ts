import { ApiProperty } from '@nestjs/swagger';

export class LocationReferenceDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() code!: string;
  @ApiProperty() name!: string;
  @ApiProperty() slug!: string;
}

export class CityCatalogDto extends LocationReferenceDto {
  @ApiProperty() publishedProjectCount!: number;
  @ApiProperty({ nullable: true, example: '6750000.0000' }) startingPrice!: string | null;
  @ApiProperty({ nullable: true, example: 'TRY' }) currency!: string | null;
}
