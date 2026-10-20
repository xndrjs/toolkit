# Support files live outside the materialization root

Architecture definition, population, generated populate API, and the successful-apply manifest default under something like `architecture/.struttura/`, outside the configured materialization root. Apply/inspect stay confined to that root and must not treat tool outputs as project artifacts. The materialization root path and codegen destination remain explicit configuration; the default layout is convention, not a hard wiring inside constructs. The default API name for the special root directory ref is `root`.
