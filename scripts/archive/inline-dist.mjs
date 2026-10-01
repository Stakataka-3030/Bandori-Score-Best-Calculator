import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const dist = resolve("dist");
const inputPath = resolve(dist, "index.html");
let html = await readFile(inputPath, "utf8");

const stylesheetPattern = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']([^"']+)["'][^>]*>/g;
for (const match of [...html.matchAll(stylesheetPattern)]) {
  const assetPath = match[1].replace(/^\.\//, "").replace(/^\//, "");
  const css = await readFile(resolve(dist, assetPath), "utf8");
  html = html.replace(match[0], `<style>\n${css}\n</style>`);
}

const scriptPattern = /<script([^>]*)src=["']([^"']+)["']([^>]*)><\/script>/g;
for (const match of [...html.matchAll(scriptPattern)]) {
  const assetPath = match[2].replace(/^\.\//, "").replace(/^\//, "");
  const js = await readFile(resolve(dist, assetPath), "utf8");
  const attributes = `${match[1]}${match[3]}`.replace(/\s*crossorigin(?:=["'][^"']*["'])?/g, "");
  html = html.replace(match[0], `<script${attributes}>\n${js}\n</script>`);
}

await writeFile(resolve(dist, "Bandori-Score-Best-Calculator.html"), html, "utf8");
