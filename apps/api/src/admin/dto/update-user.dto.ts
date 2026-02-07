import { IsBoolean, IsEmail, IsEnum, IsOptional } from "class-validator";
import { RoleKey } from "@prisma/client";

export class UpdateUserDto {
  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(RoleKey)
  role?: RoleKey;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
