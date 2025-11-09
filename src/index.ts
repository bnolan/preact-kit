import express from "express";
import fs from "fs";
import path from "path";
import { renderToString } from "preact-render-to-string";
import { h } from "preact";
import { build } from "esbuild";

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

  // 1️⃣ Serve static files (including the esbuild output)
  if (fs.existsSync(publicDir)) {
    app.use(express.static(publicDir));
  }

  // 2️⃣ Start esbuild in watch mode for client bundle
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
    loader: { ".tsx": "tsx", ".ts": "ts" },
    // watch: {
    //   onRebuild(error, result) {
    //     if (error) console.error("❌ esbuild error:", error);
    //     else console.log("✅ client rebuilt:", new Date().toLocaleTimeString());
    //   },
    // },
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

  console.log("Mounting SSR routes...");


  for (const file of fs.readdirSync(routesDir)) {
    if (!/\.(t|j)sx?$/.test(file)) continue;

    const route = file === "index.tsx" ? "/" : "/" + file.replace(/\.(t|j)sx?$/, "");
    console.log(`🔗 ${route} -> ${path.join(routesDir, file)}`);

    // import once, keep reference
    const mod = await import(path.join(routesDir, file));
    const Component = mod.default;

    // create a fresh vnode per request
    app.get(route, (req, res, next) => {
      try {
        const vnode = h(Component, {});          // create vnode now
        const html = renderToString(vnode);      // render to string in context
        res.send(htmlWrapper(html));             // send wrapped HTML
      } catch (err) {
        next(err);
      }
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