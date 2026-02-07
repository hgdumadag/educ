import jwt, { JsonWebTokenError, TokenExpiredError } from "jsonwebtoken";

import type { RoleKey } from "@prisma/client";

export interface AccessTokenPayload {
  sub: string;
  role: RoleKey;
  type: "access";
}

export interface RefreshTokenPayload {
  sub: string;
  role: RoleKey;
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
    throw new JsonWebTokenError("Invalid token type");
  }
  return decoded;
}

export function verifyRefreshToken(token: string, secret: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, secret) as RefreshTokenPayload;
  if (decoded.type !== "refresh") {
    throw new JsonWebTokenError("Invalid token type");
  }
  return decoded;
}

export function isJwtRecoverableError(error: unknown): boolean {
  return error instanceof JsonWebTokenError || error instanceof TokenExpiredError;
}
