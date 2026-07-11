import fs from "node:fs";
import path from "node:path";
import type { CodegenConfigInput } from "../codegen/codegen-config-schema.js";

export function writeCodegenConfig(configPath: string, config: CodegenConfigInput): void {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
}
