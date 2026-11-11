// Reuse the real React build and API handlers on a local Node server.
// This works with cached frontend dependencies when Next.js cannot be installed.
process.env.SOUV_LOCAL_LIVE = "1";
await import("./preview-demo.mjs");
