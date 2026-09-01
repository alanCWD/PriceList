import assert from "node:assert/strict";
import test from "node:test";
import { applyTokenResponseToSession } from "./session-token-update";

test("keeps the existing refresh token across refresh responses that omit one", () => {
  const session = {
    refresh_token: "original-refresh-token",
    expires_at: 100,
  };

  applyTokenResponseToSession(session, {
    access_token: "first-access-token",
    claims: () => ({ exp: 200 }),
  });

  assert.equal(session.refresh_token, "original-refresh-token");
  assert.equal(session.expires_at, 200);

  applyTokenResponseToSession(session, {
    access_token: "second-access-token",
    claims: () => ({ exp: 300 }),
  });

  assert.equal(session.refresh_token, "original-refresh-token");
  assert.equal(session.expires_at, 300);
});

test("stores a rotated refresh token when the provider supplies one", () => {
  const session = {
    refresh_token: "original-refresh-token",
  };

  applyTokenResponseToSession(session, {
    access_token: "new-access-token",
    refresh_token: "rotated-refresh-token",
    claims: () => ({ exp: 400 }),
  });

  assert.equal(session.refresh_token, "rotated-refresh-token");
});