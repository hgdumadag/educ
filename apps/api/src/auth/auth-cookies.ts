import { randomBytes } from "node:crypto";
import type { CookieOptions, Response } from "express";

import { env } from "../env.js";

export const ACCESS_TOKEN_COOKIE = "educ_access_token";
export const REFRESH_TOKEN_COOKIE = "educ_refresh_token";
export const CSRF_TOKEN_COOKIE = "educ_csrf_token";

const ACCESS_TOKEN_MAX_AGE_MS = 15 * 60 * 1000;
const REFRESH_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function baseCookieOptions(): CookieOptions {
  return {
    path: "/",
    secure: env.cookieSecure,
    sameSite: env.cookieSameSite,
    domain: env.cookieDomain,
  };
}

function authCookieOptions(maxAge: number): CookieOptions {
  return {
    ...baseCookieOptions(),
    httpOnly: true,
    maxAge,
  };
}

function csrfCookieOptions(): CookieOptions {
  return {
    ...baseCookieOptions(),
    httpOnly: false,
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
  };
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): string {
  const csrfToken = randomBytes(24).toString("hex");

  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, authCookieOptions(ACCESS_TOKEN_MAX_AGE_MS));
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, authCookieOptions(REFRESH_TOKEN_MAX_AGE_MS));
  res.cookie(CSRF_TOKEN_COOKIE, csrfToken, csrfCookieOptions());

  return csrfToken;
}

export function clearAuthCookies(res: Response): void {
  const opts = baseCookieOptions();
  res.clearCookie(ACCESS_TOKEN_COOKIE, opts);
  res.clearCookie(REFRESH_TOKEN_COOKIE, opts);
  res.clearCookie(CSRF_TOKEN_COOKIE, opts);
}
