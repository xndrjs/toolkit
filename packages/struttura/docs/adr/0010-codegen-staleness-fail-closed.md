# Stale generated API fails closed; no implicit codegen

The generated populate API embeds a stamp/hash of the Architecture definition. `apply` and `inspect` fail clearly when it does not match. Codegen runs only via an explicit `codegen` command—never as a side effect of apply—so drift stays visible and CI can require a committed, up-to-date generated API.
