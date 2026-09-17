import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export function hostingConfigPath(root: string): string {
  const localPath = resolve(root, ".openai", "hosting.json");
  return existsSync(localPath)
    ? localPath
    : resolve(root, ".openai", "hosting.example.json");
}

export function readHostingConfig(root: string): {
  d1: string | null;
  r2: string | null;
} {
  return JSON.parse(readFileSync(hostingConfigPath(root), "utf8"));
}
