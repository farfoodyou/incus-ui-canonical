#!/usr/bin/env node
/**
 * Keep the translated files in sync with their source.
 *
 *   node scripts/i18n-check.mjs          # report drift, exit 1 when something is stale
 *   node scripts/i18n-check.mjs --fix    # add missing locale keys (English value) and prune
 *                                        # keys that no longer exist upstream
 *
 * What is compared:
 *   - src/i18n/locales/*.json  : key sets against en.json (the source language)
 *   - README*.md               : structure (heading / code block / image / link counts) and
 *                                modification time, so a change to one language is noticed
 *                                in the others
 *
 * Text inside translated READMEs is prose and cannot be auto-generated; the checker flags
 * the file and prints which structural parts drifted, so the translation can be redone.
 */
import { readFileSync, readdirSync, writeFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const fix = process.argv.includes("--fix");
const SOURCE_LOCALE = "en";

const flatKeys = (obj, prefix = "") =>
  Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? flatKeys(v, prefix ? `${prefix}.${k}` : k)
      : [prefix ? `${prefix}.${k}` : k],
  );

const getPath = (obj, path) => path.split(".").reduce((o, k) => (o ? o[k] : undefined), obj);

const setPath = (obj, path, value) => {
  const parts = path.split(".");
  let cur = obj;
  for (const part of parts.slice(0, -1)) {
    cur[part] ??= {};
    cur = cur[part];
  }
  cur[parts.at(-1)] = value;
};

const delPath = (obj, path) => {
  const parts = path.split(".");
  let cur = obj;
  for (const part of parts.slice(0, -1)) {
    if (!cur[part]) return;
    cur = cur[part];
  }
  delete cur[parts.at(-1)];
};

let problems = 0;

/* ---------------------------------------------------------------- locales */
const localeDir = join(root, "src/i18n/locales");
const locales = readdirSync(localeDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => ({ code: f.replace(/\.json$/, ""), path: join(localeDir, f) }));

const source = JSON.parse(readFileSync(join(localeDir, `${SOURCE_LOCALE}.json`), "utf8"));
const sourceKeys = new Set(flatKeys(source).filter((k) => !k.startsWith("_meta")));

for (const locale of locales) {
  if (locale.code === SOURCE_LOCALE) continue;
  const data = JSON.parse(readFileSync(locale.path, "utf8"));
  const keys = new Set(flatKeys(data).filter((k) => !k.startsWith("_meta")));
  const missing = [...sourceKeys].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !sourceKeys.has(k));

  if (!missing.length && !extra.length) continue;

  const mtime = statSync(locale.path).mtime.toISOString().slice(0, 16);
  console.log(`locale ${locale.code} (${mtime}):`);
  for (const k of missing) console.log(`  missing  ${k}`);
  for (const k of extra) console.log(`  obsolete ${k}`);

  if (fix) {
    for (const k of missing) setPath(data, k, getPath(source, k));
    for (const k of extra) delPath(data, k);
    writeFileSync(locale.path, `${JSON.stringify(data, null, 2)}\n`);
    console.log(`  -> fixed (missing keys filled with the English text)`);
  } else {
    problems += 1;
  }
}

/* ------------------------------------------------------------------ docs */
const docs = ["README.md", "README.zh-Hans.md", "README.fr.md"].filter((f) => {
  try {
    statSync(join(root, f));
    return true;
  } catch {
    return false;
  }
});

const shape = (text) => ({
  headings: (text.match(/^#{1,6} /gm) ?? []).length,
  images: (text.match(/!\[[^\]]*\]\([^)]*\)/g) ?? []).length,
  codeBlocks: Math.floor((text.match(/^```/gm) ?? []).length / 2),
  links: (text.match(/(?<!!)\[[^\]]*\]\([^)]*\)/g) ?? []).length,
  tables: (text.match(/^\|/gm) ?? []).length,
});

const shapes = docs.map((f) => {
  const path = join(root, f);
  return {
    file: f,
    mtime: statSync(path).mtime,
    ...shape(readFileSync(path, "utf8")),
  };
});

const newest = shapes.reduce((a, b) => (a.mtime > b.mtime ? a : b));
for (const s of shapes) {
  const drift = ["headings", "images", "codeBlocks", "links"].filter(
    (k) => s[k] !== newest[k],
  );
  const when = s.mtime.toISOString().slice(0, 16);
  if (drift.length) {
    console.log(
      `doc ${s.file} (${when}): differs from ${newest.file} in ${drift
        .map((k) => `${k} ${s[k]} vs ${newest[k]}`)
        .join(", ")}`,
    );
    problems += 1;
  } else if (s.file !== newest.file) {
    console.log(`doc ${s.file} (${when}): structure matches (newest: ${newest.file})`);
  }
}

if (problems && !fix) {
  console.log(
    "\nhint: run `node scripts/i18n-check.mjs --fix` for locale keys, then update the docs by hand",
  );
  process.exit(1);
}
console.log("\nall translation files are in sync");
