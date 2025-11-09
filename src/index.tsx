import express from "express";
import fs from "fs";
import path from "path";
import { renderToStringAsync } from "preact-render-to-string";
import { h } from "preact";
import { build } from "esbuild";
import { useEffect } from "preact/hooks";

/** @jsx h */

const apiRoutes = new Map<string, any>();

export var fetch = globalThis.fetch;

export var useServer = (fn: Function, deps: any) => {
  // server side: wrap fetch
  if (typeof process === "object") {
    fetch = async (url: string | any, opts?: any) => {
      if (!url.startsWith("/api/")) {
        throw new Error(`Route ${url} is not an /api/ route`);
      }

      const handler = apiRoutes.get(url);

      if (!handler) {
        throw new Error(`No route for ${url}`);
      }

      let body: any;
      const mockReq = { method: opts?.method || "GET", url } as Request;

      const mockRes = {
        json(data: any) { body = JSON.stringify(data); return mockRes; },
        send(data: any) { body = data; return mockRes; },
        status() { return mockRes; },
      }

      await handler(mockReq, mockRes);

      return {
        ok: true,
        json: async () => JSON.parse(body),
        text: async () => body,
      } as any;
    }
  } else {
    useEffect(() => {
      fn();
    }, deps);
  }
}


/**
 * createApp()
 * -----------
 * Boots an Express app, mounts API routes and SSR pages.
 * Also spawns esbuild in watch mode for client hydration bundle.
 */
export async function createApp() {
  const app = express();
  const cwd = process.cwd();
  const routesDir = path.join(cwd, "src");
  const apiDir = path.join(cwd, "api");
  const publicDir = path.join(cwd, "public");

  // 1️⃣ Serve static files
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
  }

  // 2️⃣ Build client bundle
  const clientEntry = path.join(cwd, "src/index.tsx");
  const outFile = path.join(publicDir, "index.js");

  await build({
    entryPoints: [clientEntry],
    outfile: outFile,
    bundle: true,
    format: "esm",
    sourcemap: true,
    jsx: "automatic",
    jsxImportSource: "preact",
    target: "es2020",
    external: ["preact-kit"],
    loader: { ".tsx": "tsx", ".ts": "ts" },
  }).then(() => console.log("🧱 esbuild watching client bundle..."));

  // 3️⃣ Mount API routes
  if (fs.existsSync(apiDir)) {
    for (const file of fs.readdirSync(apiDir)) {
      if (!/\.(t|j)sx?$/.test(file)) continue;
      const route = "/" + file.replace(/\.(t|j)sx?$/, "");
      import(path.join(apiDir, file)).then((mod) => {
        const handler = mod.default || mod.handler;
        if (typeof handler === "function") {
          app.use(`/api${route}`, handler);
        }
      });
    }
  }

  // Create map of routes
  for (const layer of (app._router?.stack || [])) {
    if (!layer.route) continue;
    const path = layer.route.path;
    const isApi = path.startsWith("/api/");
    if (isApi) {
      // assume single method handler
      const handler = layer.route.stack[0].handle;
      apiRoutes.set(path, handler);
    }
  }

  console.log("Mounting SSR routes...");

  // 4️⃣ SSR routes
  for (const file of fs.readdirSync(routesDir)) {
    if (!/\.(t|j)sx?$/.test(file)) continue;

    const route = file === "index.tsx" ? "/" : "/" + file.replace(/\.(t|j)sx?$/, "");
    console.log(`🔗 ${route} -> ${path.join(routesDir, file)}`);

    const mod = await import(path.join(routesDir, file));
    const Component = mod.default;

    app.get(route, async (req, res, next) => {
      // try {
      const html = await renderToStringAsync(<div><Component /></div>);
      res.send(htmlWrapper(html));
      // } catch (err) {
      //   next(err);
      // }
    });
  }

  return app;
}

function htmlWrapper(body: string) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Preact-Kit</title>
  </head>
  <body>
    <div id="app">${body}</div>
    <script type="module" src="/index.js"></script>
  </body>
</html>`;
}