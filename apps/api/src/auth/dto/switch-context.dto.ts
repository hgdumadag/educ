import { IsString, MinLength } from "class-validator";

export class SwitchContextDto {
  @IsString()
  @MinLength(3)
  membershipId!: string;
}
