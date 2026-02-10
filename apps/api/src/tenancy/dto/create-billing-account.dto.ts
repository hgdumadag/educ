import { IsEnum, IsString, MinLength } from "class-validator";
import { BillingOwnerType } from "@prisma/client";

export class CreateBillingAccountDto {
  @IsEnum(BillingOwnerType)
  ownerType!: BillingOwnerType;

  @IsString()
  @MinLength(2)
  ownerId!: string;

  @IsString()
  @MinLength(2)
  plan!: string;
}
