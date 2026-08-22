---
"@xndrjs/resource-graph-resolver": patch
---

Add optional `resolvedResourceCache` to `ResolveContentGraphInput` so the engine can promote opaque backing entries into ContentMap when the frontier reaches them, skipping DataResolutionPort pulls for those resources. Add `buildResolvedResourceCacheFromIslands` to merge serialized islands into that backing map (`only-complete` | `all`).
