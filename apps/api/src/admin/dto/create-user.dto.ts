import { IsEmail, IsEnum, IsString, MinLength } from "class-validator";
import { RoleKey } from "@prisma/client";

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsEnum(RoleKey)
  role!: RoleKey;
}
