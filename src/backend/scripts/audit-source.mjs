import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
process.chdir(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.."));

const walk = (dir) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? walk(path.join(dir, entry.name))
        : /\.(ts|tsx|mjs)$/.test(entry.name)
          ? [path.join(dir, entry.name).replaceAll("\\", "/")]
          : [],
    );
const production = [...walk("src/backend/src"), ...walk("src/frontend/src")];
const scripts = walk("src/backend/scripts");
const tests = walk("src/backend/test");
const all = [...production, ...scripts, ...tests];
const text = new Map(all.map((file) => [file, fs.readFileSync(file, "utf8")]));
const resolve = (file, specifier) => {
  if (!specifier.startsWith(".")) return;
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier));
  return [base, base.replace(/\.js$/, ".ts"), base.replace(/\.js$/, ".tsx"), base + "/index.ts"].find(
    (candidate) => text.has(candidate),
  );
};
const graph = new Map(
  all.map((file) => [
    file,
    [...text.get(file).matchAll(/(?:from\s*|import\s*\(\s*)["']([^"']+)["']/g)]
      .map((match) => resolve(file, match[1]))
      .filter(Boolean),
  ]),
);
const visited = new Set();
function visit(file) {
  if (visited.has(file)) return;
  visited.add(file);
  for (const next of graph.get(file) ?? []) visit(next);
}
["src/backend/src/server.ts", "src/frontend/src/main.tsx", ...scripts].forEach(visit);
const exportsWithoutReferences = [];
for (const file of production) {
  const source = text.get(file);
  const names = [...source.matchAll(/export\s+(?:async\s+)?(?:function|class|const|type)\s+(\w+)/g)].map(
    (match) => match[1],
  );
  for (const block of source.matchAll(/export\s+(?:type\s+)?\{([^}]+)\}/g)) {
    names.push(
      ...block[1]
        .split(",")
        .map(
          (name) =>
            name
              .trim()
              .replace(/^type\s+/, "")
              .split(/\s+as\s+/)[0],
        )
        .filter(Boolean),
    );
  }
  for (const name of names) {
    const re = new RegExp("\\b" + name + "\\b");
    if (!all.some((other) => other !== file && re.test(text.get(other))))
      exportsWithoutReferences.push({ file, name });
  }
}
console.log(
  JSON.stringify(
    {
      sourceFiles: production.length,
      testFiles: tests.length,
      unreachableSources: production.filter((file) => !visited.has(file)),
      exportsWithoutReferences,
    },
    null,
    2,
  ),
);
const frontend = production
  .filter((file) => file.startsWith("src/frontend"))
  .map((file) => text.get(file))
  .join("\n");
const css = fs.readFileSync("src/frontend/styles.css", "utf8");
console.log(
  "CSS class candidates:",
  [...new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((match) => match[1]))].filter(
    (name) => !frontend.includes(name),
  ),
);
