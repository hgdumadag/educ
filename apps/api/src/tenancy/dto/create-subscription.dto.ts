import { IsBoolean, IsDateString, IsOptional, IsString, MinLength } from "class-validator";

export class CreateSubscriptionDto {
  @IsString()
  @MinLength(2)
  billingAccountId!: string;

  @IsDateString()
  currentPeriodStart!: string;

  @IsDateString()
  currentPeriodEnd!: string;

  @IsOptional()
  @IsBoolean()
  cancelAtPeriodEnd?: boolean;
}
