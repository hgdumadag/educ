import { Type } from "class-transformer";
import { IsArray, IsDefined, IsString, ValidateNested } from "class-validator";

class AttemptResponseDto {
  @IsString()
  questionId!: string;

  @IsDefined()
  answer?: unknown;
}

export class SaveResponsesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttemptResponseDto)
  responses!: AttemptResponseDto[];
}
