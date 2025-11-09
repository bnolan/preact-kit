#!/usr/bin/env tsx
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import ejs from "ejs";

// ...

function copyDir(srcDir: string, destDir: string, context = {}) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const file of fs.readdirSync(srcDir)) {
    const srcFile = path.join(srcDir, file);
    const destFile = path.join(destDir, file.replace(/\.ejs$/, ""));
    const stat = fs.statSync(srcFile);

    if (stat.isDirectory()) {
      copyDir(srcFile, destFile, context);
    } else if (file.endsWith(".ejs")) {
      const template = fs.readFileSync(srcFile, "utf-8");
      const rendered = ejs.render(template, context);
      fs.writeFileSync(destFile, rendered);
    } else {
      fs.copyFileSync(srcFile, destFile);
    }
  }
}
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const [, , cmd, appName] = process.argv;

  if (cmd !== "create" || !appName) {
    console.error("Usage: preact-kit create <app-name>");
    process.exit(1);
  }

  const targetDir = path.resolve(process.cwd(), appName);
  const templateDir = path.resolve(__dirname, "../templates");

  if (fs.existsSync(targetDir)) {
    console.error(`❌ Folder ${appName} already exists.`);
    process.exit(1);
  }

  console.log(`🪄 Creating new Preact-Kit app in ${targetDir}...`);
  fs.mkdirSync(targetDir, { recursive: true });

  // recursively copy from templates
  copyDir(templateDir, targetDir, { appName });

  console.log("✅ Done!");
  console.log(`Next steps:\n  cd ${appName}\n  npm install\n  npm run dev`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
