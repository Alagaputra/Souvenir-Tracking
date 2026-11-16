import test from "node:test";
import assert from "node:assert/strict";
import { readBody, readUpload, HttpError } from "../lib/http.mjs";

test("JSON bodies reject non-object input and limit bytes even without Content-Length", async () => {
  const request = body => new Request("http://localhost/api/auth", { method: "POST", body });
  assert.deepEqual(await readBody(request('{"email":"test@example.com"}')), { email: "test@example.com" });
  for (const body of ["null", "[]", '"text"', "12"]) {
    await assert.rejects(readBody(request(body)), error => error instanceof HttpError && error.status === 400);
  }
  await assert.rejects(readBody(request("{")), SyntaxError);
  await assert.rejects(readBody(request(JSON.stringify({ name: "é".repeat(9000) }))), error => error.status === 413);
});

test("upload parsing rejects oversized requests before multipart buffering", async () => {
  const request = new Request("http://localhost/api/upload", {
    method: "POST", headers: { "Content-Length": String(3 * 1024 * 1024) }, body: "small",
  });
  await assert.rejects(readUpload(request), error => error.status === 413);
  await assert.rejects(readUpload(new Request("http://localhost/api/upload", { method: "POST", body: "bad" })), error => error.status === 400);
});
