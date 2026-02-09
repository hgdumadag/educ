import { describe, expect, it, vi } from "vitest";

import { csrfMiddleware } from "./csrf.middleware.js";

function createResponseMock() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
}

describe("csrfMiddleware", () => {
  it("rejects mutating requests with missing csrf token", () => {
    const req = {
      method: "POST",
      originalUrl: "/api/assignments",
      cookies: {
        educ_access_token: "token",
      },
      header: vi.fn().mockReturnValue(undefined),
    };
    const res = createResponseMock();
    const next = vi.fn();

    csrfMiddleware(req as never, res as never, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows exempt auth refresh endpoint without csrf token", () => {
    const req = {
      method: "POST",
      originalUrl: "/api/auth/refresh",
      cookies: {},
      header: vi.fn().mockReturnValue(undefined),
    };
    const res = createResponseMock();
    const next = vi.fn();

    csrfMiddleware(req as never, res as never, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
