import { IsEnum, IsOptional } from "class-validator";
import { MembershipStatus, RoleKey } from "@prisma/client";

export class UpdateMembershipDto {
  @IsOptional()
  @IsEnum(RoleKey)
  role?: RoleKey;

  @IsOptional()
  @IsEnum(MembershipStatus)
  status?: MembershipStatus;
}
