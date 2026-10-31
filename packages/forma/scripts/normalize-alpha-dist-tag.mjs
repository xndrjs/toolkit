import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { URL } from "node:url";

const manifest = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const { name, version } = manifest;

if (typeof name !== "string" || typeof version !== "string" || !version.includes("-alpha.")) {
  throw new Error("Forma alpha tag normalization requires an alpha package version");
}

const packageSpec = `${name}@${version}`;
execFileSync("npm", ["dist-tag", "add", packageSpec, "alpha"], { stdio: "inherit" });
