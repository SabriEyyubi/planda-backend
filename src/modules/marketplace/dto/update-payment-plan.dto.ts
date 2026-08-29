import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';
import { CreatePaymentPlanDto } from './upsert-inventory.dto';

export class UpdatePaymentPlanDto extends PartialType(CreatePaymentPlanDto) {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class DeletePaymentPlanDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
