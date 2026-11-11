import test from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword,
  newSession,
  tokenHash,
  readSession,
  sessionCookie,
} from "../lib/local-security.mjs";
import { requestURL } from "../lib/public-origin.mjs";
test("configured HTTPS tunnel preserves CSRF origin and Secure cookie without changing localhost", () => {
  const origin = "https://souv-test.ngrok-free.app";
  const publicRequest = new Request(
    requestURL("/api/auth", "souv-test.ngrok-free.app", origin),
    { headers: { origin } },
  );
  assert.equal(new URL(publicRequest.url).origin, origin);
  assert.ok(sessionCookie(publicRequest, newSession()).includes("; Secure"));
  assert.equal(
    requestURL("/api/auth", "localhost:3000", origin).origin,
    "http://localhost:3000",
  );
  assert.equal(
    requestURL("/api/auth", "untrusted.test", origin).origin,
    "http://untrusted.test",
  );
  assert.throws(() =>
    requestURL("//evil.test/api/auth", "localhost:3000", origin),
  );
});
test("password hashing has random salts and verifies without plaintext storage", async () => {
  const password = "A local password with 123!";
  const a = await hashPassword(password),
    b = await hashPassword(password);
  assert.notEqual(a, b);
  assert.equal(a.includes(password), false);
  assert.equal(await verifyPassword(password, a), true);
  assert.equal(await verifyPassword("wrong", a), false);
  assert.equal(await verifyPassword(password, "invalid"), false);
});
test("opaque session tokens, malformed cookies, and secure cookie flags", () => {
  const a = newSession(),
    b = newSession();
  assert.notEqual(a, b);
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.notEqual(tokenHash(a), a);
  const request = new Request("https://localhost:3000", {
    headers: { cookie: `other=x; souv_session=${a}` },
  });
  assert.equal(readSession(request), a);
  assert.equal(
    readSession(
      new Request("http://localhost", {
        headers: { cookie: "souv_session=bad" },
      }),
    ),
    null,
  );
  const cookie = sessionCookie(request, a);
  assert.ok(cookie.includes("HttpOnly"));
  assert.ok(cookie.includes("SameSite=Lax"));
  assert.ok(cookie.includes("; Secure"));
  assert.ok(sessionCookie(request).includes("Max-Age=0"));
});
