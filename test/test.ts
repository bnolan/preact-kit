import { spawn } from "child_process";
import { rmSync } from "fs";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");
const testDir = path.join(root, "testapp");
// pick a random ephemeral port between 4000–4999
const PORT = 4000 + Math.floor(Math.random() * 1000);


async function main() {
  console.log("🧪 cleaning...");
  rmSync(testDir, { recursive: true, force: true });

  console.log("🪄 creating test app...");
  await exec("npx", ["tsx", "bin/cli.ts", "create", "testapp"], root);

  // List all files in the test directory
  console.log("📂 listing files in test directory...");
  await exec("find", ["."], testDir);

  console.log("📦 installing deps...");
  await exec("npm", ["install"], testDir);

  console.log("🚀 starting server...");
  const server = spawn("npx", ["tsx", "server.ts"], {
    cwd: testDir,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, PORT },
  });

  await waitForOutput(server, "http://localhost:", 20000);

  console.log("🌐 fetching homepage...");
  const html = await fetchOnce(`http://localhost:${PORT}/`);

  console.log("🌐 HTML:", html);

  if (html.includes("Hello world!")) {
    console.log("✅ success: SSR output looks good.");
  } else {
    console.error("❌ failure: expected 'Hello world!' in HTML.");
    process.exitCode = 1;
  }

  console.log("🧹 shutting down...");
  server.kill("SIGINT");
}

main().catch((err) => {
  console.error("❌ test failed:", err);
  process.exit(1);
});

// ---------- helpers ----------

function exec(cmd: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, {
      cwd,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    p.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))
    );
  });
}

function waitForOutput(
  proc: ReturnType<typeof spawn>,
  text: string,
  timeout = 10000
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("timeout waiting for server")),
      timeout
    );
    proc?.stdout?.on("data", (data) => {
      console.log("> ", data.toString().trim());

      const line = data.toString();
      if (line.includes(text)) {
        clearTimeout(timer);
        resolve();
      }
    });
    proc?.stderr?.on("data", (d) => process.stderr.write(d));
  });
}

function fetchOnce(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve(data));
      })
      .on("error", reject);
  });
}
