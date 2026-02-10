import jwt from "jsonwebtoken";

import type { RoleKey } from "@prisma/client";

interface BaseTokenPayload {
  sub: string;
  activeTenantId: string;
  activeMembershipId: string;
  activeRole: RoleKey;
}

export interface AccessTokenPayload extends BaseTokenPayload {
  type: "access";
}

export interface RefreshTokenPayload extends BaseTokenPayload {
  type: "refresh";
}

export function signAccessToken(payload: Omit<AccessTokenPayload, "type">, secret: string): string {
  return jwt.sign({ ...payload, type: "access" }, secret, { expiresIn: "15m" });
}

export function signRefreshToken(payload: Omit<RefreshTokenPayload, "type">, secret: string): string {
  return jwt.sign({ ...payload, type: "refresh" }, secret, { expiresIn: "7d" });
}

export function verifyAccessToken(token: string, secret: string): AccessTokenPayload {
  const decoded = jwt.verify(token, secret) as AccessTokenPayload;
  if (decoded.type !== "access") {
    throw new Error("Invalid token type");
  }
  return decoded;
}

export function verifyRefreshToken(token: string, secret: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, secret) as RefreshTokenPayload;
  if (decoded.type !== "refresh") {
    throw new Error("Invalid token type");
  }
  return decoded;
}

export function isJwtRecoverableError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "JsonWebTokenError" || error.name === "TokenExpiredError")
  );
}
