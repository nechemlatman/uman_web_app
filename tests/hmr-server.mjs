import { cp, mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
const target = resolve(".local/hmr-test");
await mkdir(target, { recursive: true });
await cp("src", resolve(target, "src"), { recursive: true });
await cp("index.html", resolve(target, "index.html"));
await writeFile(resolve(target, "package.json"), '{"type":"module"}');
await writeFile(
  resolve(target, "vite.config.ts"),
  'import {defineConfig} from "vite";import react from "@vitejs/plugin-react";export default defineConfig({plugins:[react()],cacheDir:".vite"});',
);
const child = spawn(
  process.execPath,
  [
    "node_modules/vite/bin/vite.js",
    target,
    "--host",
    "127.0.0.1",
    "--port",
    "5180",
    "--strictPort",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      VITE_SUPABASE_URL: "https://fixture.supabase.co",
      VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
    },
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    child.kill();
    process.exit(0);
  });
child.on("exit", (code) => process.exit(code ?? 1));
