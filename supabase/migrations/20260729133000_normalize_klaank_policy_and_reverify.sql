-- Klaank's comma-delimited policy input was previously split into standalone
-- fragments. In particular, the single word "Safety" caused responsible
-- robotics posts that mentioned safety controls to fail the restricted-topic
-- gate. Restore the intended phrase-level policy without weakening the gate.
update public.brand_profiles profile
set content_pillars = array[
      'Robotics market news and commercial deployments',
      'Industrial automation use cases',
      'Buyer education, readiness and ROI',
      'Robotics suppliers, integrators and ecosystem',
      'Safety, workforce and responsible adoption'
    ]::text[],
    restricted_topics = array[
      'Unverified product performance or ROI claims',
      'Guaranteed cost savings, payback periods, or business outcomes',
      'Unsupported first, best, leading, or revolutionary claims',
      'Unverified safety, compliance, legal, or investment claims',
      'Undisclosed vendor endorsements or favoritism',
      'Claims that robots will replace all human work'
    ]::text[],
    updated_at = now()
from public.brands brand
where profile.brand_id = brand.id
  and brand.slug = 'klaank'
  and profile.restricted_topics @> array['Safety']::text[];

-- Re-evaluate only recent Klaank drafts proven to have been blocked by the
-- malformed standalone restriction. WF-10 supplies a fresh attempt-specific
-- idempotency key, so the deterministic verifier can persist the corrected
-- evaluation without re-running research or post generation.
update public.run_recoveries recovery
set status = 'scheduled',
    category = 'validation',
    error_code = 'brand_policy_reverification',
    retryable = true,
    next_retry_at = now(),
    lease_expires_at = null,
    recovered_at = null,
    updated_at = now()
from public.generation_runs root,
     public.post_drafts draft,
     public.brands brand
where recovery.root_generation_run_id = root.id
  and root.entity_id = draft.id
  and draft.brand_id = brand.id
  and brand.slug = 'klaank'
  and recovery.target = 'post_verification'
  and recovery.status = 'completed'
  and recovery.attempt_count < recovery.max_attempts
  and recovery.created_at >= now() - interval '48 hours'
  and draft.score_breakdown #> '{evaluation,restrictedTopics}'
      @> '["Safety"]'::jsonb;
