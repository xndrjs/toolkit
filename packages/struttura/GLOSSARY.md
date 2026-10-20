# Struttura

Domain language for declaring a repository architecture, populating construct instances, and materializing file/folder artifacts.

## Language

**Architecture**:
The declared set of constructs, their dependency contracts, and how their instances produce artifacts.
_Avoid_: Schema, ontology, blueprint

**Construct**:
A named factory definition that produces artifacts for each of its instances, with an optional typed dependency contract.
_Avoid_: Component, module, template type

**Instance**:
A concrete registration of a construct in a Population, identified by an effective ID.
_Avoid_: Node, entity, registration (as a noun for the thing itself)

**Population**:
The explicit set of instances and their dependency relations for one application of an Architecture.
_Avoid_: Repository (for this concept), graph, world, model

**Repository**:
The filesystem project (git root or workspace) that may contain architecture files, a materialization root, and other paths outside that root.
_Avoid_: Population, project (when meaning the whole VCS tree)

**Materialization root**:
The configured directory inside which artifact create/update/move/delete operations are confined.
_Avoid_: Project root, output root, target (unless clearly meaning this)

**Artifact**:
A managed file or folder produced by an instance, identified by `(instanceId, artifactKey)`, with a derived path.
_Avoid_: Output, emission, resource

**Artifact key**:
The stable name of an artifact within an instance; independent of filename and path.
_Avoid_: Artifact id, alias, handle

**Provenance**:
Which instance (and thus construct) produced an artifact; not transferred by physical placement under another instance's folder.
_Avoid_: Ownership (when meaning placement), parent

**Scaffold**:
File management mode that creates or restores from an initial template and preserves authored content while the artifact remains declared.
_Avoid_: Seed, once, initial-only

**Sync**:
File management mode that regenerates derived content on each successful apply while the artifact remains declared.
_Avoid_: Generated, managed (alone), derived (as the mode name)

**DirRef**:
A typed reference to a directory artifact (or to the materialization `root`), usable as `file({ directory })`.
_Avoid_: Path string, folder handle

**FileRef**:
A typed reference to a file artifact; not usable where a directory is required.
_Avoid_: Path string, file handle
