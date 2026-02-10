import { IsOptional, IsString, Matches, MinLength } from "class-validator";

export class CreateInstitutionDto {
  @IsString()
  @MinLength(2)
  name!: string;

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
}
