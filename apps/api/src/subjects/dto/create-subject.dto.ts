import { IsOptional, IsString, MaxLength } from "class-validator";

export class CreateSubjectDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  teacherOwnerId?: string;
}
