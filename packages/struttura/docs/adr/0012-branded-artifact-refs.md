# Branded DirRef and FileRef on navigable instances

Generated populate refs are navigable: directory-root instances are `DirRef` plus declared children; file-root instances are `FileRef`. A file ref is not assignable where a directory destination is required (`A.in`, placement). We rejected stringly `getArtifact(key)` and interchangeable structural ids: the Structure declaration is the single source of keys and kinds; codegen must make misuse a TypeScript error.

(Historical note: wave 1 exposed the same DirRef/FileRef brands on a flat `instance.artifacts.<key>` map; that map is no longer part of the public authoring/codegen surface.)
