# Typed Population collector for registration

Population uses an explicit typed collector produced for a Structure (codegen exposes construct factories on that collector). Factory calls register instances only; they do not touch the filesystem. We rejected module-global registration and a parallel hand-maintained instance array: the collector keeps registration circumscribed, typable, and aligned with the generated API.
