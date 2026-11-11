import test from "node:test";
import assert from "node:assert/strict";
import {
  positiveInteger,
  requiredText,
  parseProductQR,
  parseProductLink,
  productLink,
  inDateRange,
} from "../lib/domain.mjs";
test("stock quantities reject fractions, negative values, infinity and oversized input", () => {
  assert.equal(positiveInteger("12"), 12);
  for (const invalid of [
    0,
    -1,
    1.5,
    "abc",
    Infinity,
    1000001,
    "",
    null,
    true,
    ["1"],
  ])
    assert.throws(() => positiveInteger(invalid));
});
test("recipient validation trims whitespace and rejects empty or oversized names", () => {
  assert.equal(requiredText("  Budi Santoso  ", "Nama"), "Budi Santoso");
  for (const invalid of ["", "  ", null, 123, "x".repeat(161)])
    assert.throws(() => requiredText(invalid, "Nama"));
});
test("QR accepts legacy IDs and web product links while rejecting unrelated URLs", () => {
  assert.equal(
    parseProductQR("SOUVENIR:10000000-0000-4000-8000-000000000001"),
    "10000000-0000-4000-8000-000000000001",
  );
  for (const invalid of [
    "https://evil.test",
    "javascript:alert(1)",
    "SOUVENIR:123",
    "SOUVENIR:10000000-0000-4000-8000-000000000001:9",
  ])
    assert.throws(() => parseProductQR(invalid));
});
test("QR links open the exact product and selected stock action without embedding a quantity", () => {
  const id = "10000000-0000-4000-8000-000000000001";
  for (const mode of ["in", "out"]) {
    const link = productLink("https://souv.example", id, mode);
    assert.equal(new URL(link).origin, "https://souv.example");
    assert.deepEqual(parseProductLink(link), { productId: id, mode });
    assert.equal(parseProductQR(link), id);
    assert.equal(new URL(link).searchParams.has("quantity"), false);
  }
  for (const bad of [
    `javascript:alert(1)`,
    `https://souv.example/?product=${id}&mode=delete`,
    `https://souv.example/?product=invalid`,
    `https://souv.example/?product=${id}&product=${id}`,
  ])
    assert.throws(() => parseProductLink(bad));
});
test("date filters include the complete selected day in WIB, not UTC", () => {
  assert.equal(
    inDateRange("2026-10-25T18:00:00Z", "2026-10-26", "2026-10-26"),
    true,
  );
  assert.equal(
    inDateRange("2026-10-26T16:59:59Z", "2026-10-26", "2026-10-26"),
    true,
  );
  assert.equal(
    inDateRange("2026-10-26T17:00:00Z", "2026-10-26", "2026-10-26"),
    false,
  );
});
