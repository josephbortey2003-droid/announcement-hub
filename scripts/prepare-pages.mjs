import { copyFile, mkdir, writeFile } from "node:fs/promises";

const output = new URL("../pages-dist/", import.meta.url);
for (const route of ["privacy", "terms"]) {
  const directory = new URL(`${route}/`, output);
  await mkdir(directory, { recursive: true });
  await copyFile(new URL("index.html", output), new URL("index.html", directory));
}
await copyFile(new URL("index.html", output), new URL("404.html", output));
await writeFile(new URL(".nojekyll", output), "", "utf8");
