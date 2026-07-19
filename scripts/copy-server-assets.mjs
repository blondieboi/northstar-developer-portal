import { copyFile, mkdir } from "node:fs/promises";

await mkdir(new URL("../build/server/", import.meta.url), { recursive: true });
await copyFile(
  new URL("../server/schema.sql", import.meta.url),
  new URL("../build/server/schema.sql", import.meta.url),
);
