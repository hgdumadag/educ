import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsOptional } from "class-validator";

function toBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") {
      return true;
    }
    if (normalized === "false" || normalized === "0") {
      return false;
    }
  }
  return undefined;
}

const ENROLLMENT_STATUSES = ["active", "completed"] as const;

type EnrollmentStatusValue = (typeof ENROLLMENT_STATUSES)[number];

export class UpdateSubjectEnrollmentDto {
  @IsOptional()
  @IsIn(ENROLLMENT_STATUSES)
  status?: EnrollmentStatusValue;

  @IsOptional()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  autoAssignFuture?: boolean;
}
