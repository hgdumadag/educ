import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { RoleKey } from "@prisma/client";

export class CreateMembershipDto {
  @IsEmail()
  email!: string;

  @IsEnum(RoleKey)
  role!: RoleKey;

  @IsOptional()
  @IsString()
  @MinLength(8)
  temporaryPassword?: string;
}
