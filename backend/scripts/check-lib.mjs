#!/usr/bin/env node
/**
 * Fail if frontend-only packages appear in backend/src.
 * Run before deploy: npm run check:lib
 */
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const ROOT = join(import.meta.dirname, "..", "src");
const FORBIDDEN = [
  { pattern: /from ["']framer-motion["']/g, label: "framer-motion" },
  { pattern: /from ["']socket\.io-client["']/g, label: "socket.io-client" },
  { pattern: /from ["']@\/components\//g, label: "@/components" },
];

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else if (/\.(ts|tsx)$/.test(name)) files.push(path);
  }
  return files;
}

const violations = [];
for (const file of walk(ROOT)) {
  const text = readFileSync(file, "utf8");
  for (const { pattern, label } of FORBIDDEN) {
    if (pattern.test(text)) {
      violations.push(`${file}: imports ${label}`);
    }
    pattern.lastIndex = 0;
  }
}

if (violations.length > 0) {
  console.error("Backend lib check failed — frontend deps in backend/src:\n");
  violations.forEach((v) => console.error("  " + v));
  process.exit(1);
}

console.log("check:lib OK — no frontend-only imports in backend/src");
