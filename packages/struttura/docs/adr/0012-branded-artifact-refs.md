# Branded DirRef and FileRef on instance.artifacts

Generated instance refs expose artifacts as `instance.artifacts.<key>` with distinct `DirRef` and `FileRef` types so a file ref cannot be passed where a directory is required. We rejected stringly `getArtifact(key)` and interchangeable structural ids: the Architecture declaration is the single source of keys and kinds; codegen must make misuse a TypeScript error.
