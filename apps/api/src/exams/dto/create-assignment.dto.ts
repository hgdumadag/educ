import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
} from "class-validator";

export class CreateAssignmentDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  studentIds!: string[];

  @IsOptional()
  @IsString()
  lessonId?: string;

  @IsOptional()
  @IsString()
  examId?: string;

  @IsOptional()
  @IsDateString()
  dueAt?: string;
}
