#!/usr/bin/env node
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { runWithTsx } from "./run-with-tsx.mjs";

const script = join(dirname(fileURLToPath(import.meta.url)), "../src/audit/run-audit.ts");

runWithTsx(script);
