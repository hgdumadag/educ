import { IsString } from "class-validator";

export class CreateAttemptDto {
  @IsString()
  assignmentId!: string;
}
