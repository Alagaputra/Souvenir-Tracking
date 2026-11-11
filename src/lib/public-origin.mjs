// Only a configured public host can change the scheme seen by the local API.
// Arbitrary forwarded headers must not affect CSRF checks or session cookies.
export function requestURL(
  path,
  host = "localhost:3000",
  publicOrigin = process.env.APP_PUBLIC_ORIGIN,
) {
  let base = new URL(`http://${host}`);
  if (base.username || base.password) throw new Error("Host tidak valid.");
  if (publicOrigin) {
    const configured = new URL(publicOrigin);
    if (
      configured.protocol !== "https:" ||
      configured.username ||
      configured.password ||
      configured.pathname !== "/" ||
      configured.search ||
      configured.hash
    )
      throw new Error("APP_PUBLIC_ORIGIN harus berupa origin HTTPS.");
    if (base.host === configured.host) base = configured;
  }
  const target = new URL(path, base);
  if (target.origin !== base.origin)
    throw new Error("Origin permintaan tidak valid.");
  return target;
}
