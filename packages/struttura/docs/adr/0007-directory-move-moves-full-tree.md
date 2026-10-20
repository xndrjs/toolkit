# Directory artifact moves move the full tree

When a managed directory artifact changes path, reconciliation moves the entire filesystem tree at that path, including untracked files inside it. This matches recursive deletion of a directory artifact (manual files are swept with the folder) and avoids orphaning authored files at the old location. Untracked files are still not adopted as Struttura artifacts.
