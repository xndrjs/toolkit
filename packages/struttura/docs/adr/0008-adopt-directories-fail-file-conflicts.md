# Adopt preexisting directories; fail on unmanaged file conflicts

Creating a directory artifact uses mkdir-p / adopt semantics when the path is missing or already a directory. Apply fails if the path exists as a file, or if a managed file target would overwrite an unmanaged file already on disk. Preexisting foreign files are never silently overwritten or registered as managed artifacts merely by sitting under a managed folder.
