import { IsEnum, IsOptional, IsString, Matches, MinLength } from "class-validator";
import { TenantStatus } from "@prisma/client";

export class UpdateInstitutionDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9-]{3,64}$/)
  slug?: string;

  @IsOptional()
  @IsString()
  legalName?: string;

  @IsOptional()
  @IsString()
  domain?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsEnum(TenantStatus)
  status?: TenantStatus;
}
