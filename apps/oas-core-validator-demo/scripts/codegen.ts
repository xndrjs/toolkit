import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import SwaggerParser from "@apidevtools/swagger-parser";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const oasPath = path.join(appRoot, "openapi", "openapi.yaml");
const generatedDir = path.join(appRoot, "src", "generated");
const bundledPath = path.join(generatedDir, "openapi.bundled.json");

async function main() {
  await mkdir(generatedDir, { recursive: true });
  const bundled = (await SwaggerParser.bundle(oasPath)) as Record<string, unknown>;
  await writeFile(bundledPath, `${JSON.stringify(bundled, null, 2)}\n`, "utf8");

  console.log(`Generated bundled OAS at ${path.relative(appRoot, bundledPath)}`);
  console.log("Generated TS types via openapi-typescript CLI at src/generated/openapi.types.ts");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
