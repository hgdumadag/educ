import { IsEmail, IsOptional, IsString, MinLength } from "class-validator";

export class AddInstitutionAdminDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MinLength(8)
  temporaryPassword?: string;
}
