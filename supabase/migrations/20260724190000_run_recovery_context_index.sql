create index if not exists workflow_execution_contexts_recovery_idx
  on private.workflow_execution_contexts (recovery_id);
