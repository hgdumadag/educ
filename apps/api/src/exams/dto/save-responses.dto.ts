import { Type } from "class-transformer";
import { IsArray, IsOptional, IsString, ValidateNested } from "class-validator";

class AttemptResponseDto {
  @IsString()
  questionId!: string;

  @IsOptional()
  answer?: unknown;
}

export class SaveResponsesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttemptResponseDto)
  responses!: AttemptResponseDto[];
}
