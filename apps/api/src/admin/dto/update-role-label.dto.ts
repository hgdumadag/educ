import { IsString, MinLength } from "class-validator";

export class UpdateRoleLabelDto {
  @IsString()
  @MinLength(2)
  displayLabel!: string;
}
