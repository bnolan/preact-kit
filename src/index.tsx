import express from "express";
import fs from "fs";
import path from "path";
import { renderToStringAsync } from "preact-render-to-string";
import { h } from "preact";
import { build } from "esbuild";
import { useEffect, useState } from "preact/hooks";
import { Suspense, lazy } from 'preact/compat';
import QuickLRU from "quick-lru";

/** @jsx h */

const apiRoutes = new Map<string, any>();
const inflight = new Map<string, Promise<any>>();
// const fetchCache = new Map<string, any>();
const fetchCache = new QuickLRU({ maxSize: 32768, maxAge: 1000 });

export function useFetchState(url: string) {
  console.log('useFetchState called with url:', url)

  if (typeof window === "undefined") {
    if (inflight.has(url)) {
      throw inflight.get(url);
    }

    if (fetchCache.has(url)) {
      return useState(fetchCache.get(url));
    }

    console.log('fetching', url)

    if (!url.startsWith("/api/")) {
      throw new Error(`Route ${url} is not an /api/ route`);
    }

    const handler = apiRoutes.get(url);

    if (!handler) {
      throw new Error(`No route for ${url}`);
    }


    console.log('throwing...')
    const f = async function () {
      let body: any;
      const mockReq = { method: "GET", url } as Request;

      const mockRes = {
        json(data: any) { body = data; return mockRes; },
        send(data: any) { body = data; return mockRes; },
        status() { return mockRes; },
      }

      console.log('querying..')

      // await new Promise(resolve => setTimeout(resolve, 5)); // force async
      await handler(mockReq, mockRes)
      const key = Object.keys(body)[0];
      const value = body[key]

      console.log('..got response')

      inflight.delete(url)
      fetchCache.set(url, value)

      return useState(value)
    }

    const promise = f()
    inflight.set(url, promise)
    throw promise;
  }

  const response = useState("");
  const [value, setValue] = response;

  async function load() {
    const response = await fetch(url);
    const data = await response.json();
    const key = Object.keys(data)[0];

    setValue(data[key]);
  }

  useEffect(() => {
    load();
  }, []);

  return response;
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
  console.log("Mounting API routes...");

  if (fs.existsSync(apiDir)) {
    for (const file of fs.readdirSync(apiDir)) {
      if (!/\.(t|j)sx?$/.test(file)) {
        continue;
      }

      const route = "/" + file.replace(/\.(t|j)sx?$/, "");
      import(path.join(apiDir, file)).then((mod) => {
        const handler = mod.default || mod.handler;
        if (typeof handler === "function") {
          console.log(`🔗 /api${route} -> ${path.join(apiDir, file)}`);
          app.use(`/api${route}`, handler);
          apiRoutes.set(`/api${route}`, handler);
        }
      });
    }
  }


  // 4️⃣ SSR routes
  console.log("Mounting SSR routes...");

  for (const file of fs.readdirSync(routesDir)) {
    if (!/\.(t|j)sx?$/.test(file)) continue;

    const route = file === "index.tsx" ? "/" : "/" + file.replace(/\.(t|j)sx?$/, "");
    console.log(`🔗 ${route} -> ${path.join(routesDir, file)}`);

    // const mod = await import(path.join(routesDir, file));
    // const Component = mod.default;

    app.get(route, async (req, res, next) => {
      const Page = lazy(() => import(path.join(routesDir, file)));

      // const Page = lazy(async () => {
      //         // haha

      //         return { default: <Component /> }
      //       })

      const html = await renderToStringAsync(<Suspense fallback={<p>Loading</p>}><Page /></Suspense>);
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