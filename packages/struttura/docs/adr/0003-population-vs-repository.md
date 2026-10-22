# Population is not the filesystem repository

The set of construct instances and dependency relations is called a **Population**. **Repository** means only the filesystem project that may contain structure files, a materialization root, and paths outside that root. Overloading “repository” for both made APIs and docs ambiguous; API names follow this split (`populate` / Population, not “createRepository” for the instance set).
