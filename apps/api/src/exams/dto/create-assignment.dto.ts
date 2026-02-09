import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsDateString,
  IsOptional,
  IsString,
  Max,
  Min,
} from "class-validator";
import { Type } from "class-transformer";

const ASSIGNMENT_TYPES = ["practice", "assessment"] as const;

export type AssignmentTypeValue = (typeof ASSIGNMENT_TYPES)[number];

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

  @IsOptional()
  @IsIn(ASSIGNMENT_TYPES)
  assignmentType?: AssignmentTypeValue;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  maxAttempts?: number;
}
