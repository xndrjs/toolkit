# Recovery is idempotent re-plan, not partial resume

Apply is not cross-file transactional. After an interrupt, the next run rebuilds a plan from desired inventory + last successful manifest + real disk and reapplies idempotently. We do not resume a half-finished operation journal as structural truth. The versioned manifest records only the last fully successful apply; optional local diagnostics must not replace it.
