import { IsString } from "class-validator";

export class CreateAttemptDto {
  @IsString()
  examId!: string;
}
