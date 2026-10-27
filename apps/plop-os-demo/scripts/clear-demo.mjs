#!/usr/bin/env node
import { GENERATED, clearGenerated, demoRoot } from "./generated-paths.mjs";

const removed = clearGenerated();
if (removed.length === 0) {
  console.log(`Nothing to clear under ${demoRoot} (${GENERATED.join(", ")})`);
} else {
  console.log(`Cleared: ${removed.join(", ")}`);
}
