// React preview, or real local API mode through scripts/run-local.mjs.
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join, dirname, extname, isAbsolute } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { requestURL } from "../lib/public-origin.mjs";
const root = resolve(import.meta.dirname, "..");
const previewRoot = resolve(root, "../arsip-lokal/preview");
const live = process.env.SOUV_LOCAL_LIVE === "1";
if (live && existsSync(join(root, ".env.local")))
  process.loadEnvFile(join(root, ".env.local"));
const localAPI = live ? (await import("../lib/local-api.mjs")).handleAPI : null;
const moduleRoot = existsSync(join(root, "node_modules/esbuild"))
  ? join(root, "node_modules")
  : resolve(root, "../node_modules");
const { build } = await import(
  pathToFileURL(join(moduleRoot, "esbuild/lib/main.js")).href
);
await mkdir(join(previewRoot, "dist"), { recursive: true });
const entry = `import React from 'react';import{createRoot}from'react-dom/client';import Workspace from '${join(root, "components/workspace.tsx").replaceAll("\\", "/")}';createRoot(document.getElementById('root')).render(React.createElement(Workspace));`;
const requireFromModules = createRequire(join(moduleRoot, "../package.json"));
// Load through Node so restricted Windows workspaces do not require reading parent directories.
const localFiles = {
  name: "local-files",
  setup(builder) {
    builder.onResolve({ filter: /.*/ }, (args) => {
      if (args.path === "html5-qrcode")
        return { path: args.path, external: true };
      let filename;
      if (args.path.startsWith("@/")) filename = join(root, args.path.slice(2));
      else if (isAbsolute(args.path)) filename = args.path;
      else if (args.path.startsWith("."))
        filename = resolve(
          args.importer ? dirname(args.importer) : root,
          args.path,
        );
      else filename = requireFromModules.resolve(args.path);
      if (!existsSync(filename) || !extname(filename)) {
        const candidate = [
          "",
          ".ts",
          ".tsx",
          ".js",
          ".mjs",
          ".json",
          "/index.js",
        ]
          .map((ext) => filename + ext)
          .find((p) => existsSync(p) && extname(p));
        if (candidate) filename = candidate;
      }
      // qrcode's browser entry avoids bundling its Node PNG renderer.
      if (args.path === "qrcode")
        filename = join(moduleRoot, "qrcode/lib/browser.js");
      // The standalone build avoids Node-only streams in the browser preview.
      if (args.path === "jszip")
        filename = join(moduleRoot, "jszip/dist/jszip.min.js");
      return { path: filename, namespace: "local-node" };
    });
    builder.onLoad({ filter: /.*/, namespace: "local-node" }, async (args) => ({
      contents: await readFile(args.path, "utf8"),
      loader:
        { ".tsx": "tsx", ".ts": "ts", ".json": "json" }[extname(args.path)] ||
        "js",
    }));
  },
};
await build({
  stdin: { contents: entry, resolveDir: root, loader: "tsx" },
  outfile: join(previewRoot, "dist/app.js"),
  bundle: true,
  format: "esm",
  jsx: "automatic",
  tsconfigRaw: { compilerOptions: { jsx: "react-jsx" } },
  plugins: [localFiles],
  define: { "process.env.NODE_ENV": '"development"' },
  sourcemap: true,
});
const css = (await readFile(join(root, "app/globals.css"), "utf8")).replace(
  '@import "tailwindcss";',
  "",
);
const theme = await readFile(join(root, "app/theme.css"), "utf8");
await writeFile(join(previewRoot, "dist/style.css"), css + "\n" + theme);
if (process.argv.includes("--build-only")) {
  console.log("Demo bundle compiled.");
  process.exit(0);
}
const html =
  '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>SOUV — Demo tampilan</title><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>';
const port = Number(process.env.PORT || 3000);
const server = createServer(async (req, res) => {
  if (req.url?.startsWith("/api/")) {
    if (localAPI) {
      try {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 3 * 1024 * 1024) {
            res.statusCode = 413;
            res.end(
              JSON.stringify({ error: "Ukuran permintaan terlalu besar." }),
            );
            return;
          }
          chunks.push(chunk);
        }
        const target = requestURL(req.url, req.headers.host);
        const input = new Request(target, {
          method: req.method,
          headers: req.headers,
          ...(!["GET", "HEAD"].includes(req.method)
            ? { body: Buffer.concat(chunks) }
            : {}),
        });
        const result = await localAPI(input);
        res.statusCode = result.status;
        for (const [key, value] of result.headers) {
          if (key !== "set-cookie") res.setHeader(key, value);
        }
        const cookies = result.headers.getSetCookie();
        if (cookies.length) res.setHeader("Set-Cookie", cookies);
        res.end(Buffer.from(await result.arrayBuffer()));
      } catch {
        res.statusCode = 500;
        res.end(
          JSON.stringify({ error: "Server lokal gagal memproses permintaan." }),
        );
      }
      return;
    }
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Cache-Control", "no-store");
    if (req.method === "GET" && req.url === "/api/workspace") {
      res.end('{"setup":true}');
    } else {
      res.statusCode = 503;
      res.end(
        JSON.stringify({
          error:
            "Server ini hanya untuk pratinjau. Jalankan npm run local untuk memakai PostgreSQL lokal.",
        }),
      );
    }
    return;
  }
  const paths = {
    "/app.js": ["app.js", "text/javascript"],
    "/app.js.map": ["app.js.map", "application/json"],
    "/style.css": ["style.css", "text/css"],
  };
  const font = /^\/fonts\/(dm-sans-(?:400|500|600|700)\.woff2)$/.exec(
    req.url || "",
  );
  if (font) {
    res.setHeader("Content-Type", "font/woff2");
    res.end(await readFile(join(root, "public/fonts", font[1])));
    return;
  }
  const asset = paths[req.url];
  if (asset) {
    try {
      res.setHeader("Content-Type", asset[1]);
      res.end(await readFile(join(previewRoot, "dist", asset[0])));
    } catch {
      res.statusCode = 404;
      res.end();
    }
    return;
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(html);
});
server.listen(port, "127.0.0.1", () =>
  console.log(
    `SOUV ${live ? "local app" : "demo preview"}: http://localhost:${port} (${live ? "PostgreSQL lokal" : "read-only example data"})`,
  ),
);
