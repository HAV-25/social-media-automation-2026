import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const migrationPath = fileURLToPath(
  new URL(
    "../../../supabase/migrations/20260726102001_brand_automation_policy.sql",
    import.meta.url,
  ),
);
const sql = readFileSync(migrationPath, "utf8");
const secretKeyCompatibilitySql = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260726135500_support_secret_keys_for_brand_automation.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const stableIdentitySql = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260726141000_stable_rss_reservation_identity.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const completedReservationSql = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260726142500_complete_rss_reservations.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const duplicateReservationSql = readFileSync(
  fileURLToPath(
    new URL(
      "../../../supabase/migrations/20260727160759_avoid_duplicate_rss_reservations.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);

describe("brand-wide opportunity selection migration", () => {
  it("adds bounded policy columns to the existing RLS-protected brand profile", () => {
    expect(sql).toContain("automatic_opportunity_selection boolean not null default true");
    expect(sql).toContain("minimum_opportunity_score between 60 and 100");
    expect(sql).toContain("daily_draft_limit between 0 and 20");
  });

  it("serializes and counts reservations across all feeds for one brand", () => {
    expect(sql).toContain("for update of profile");
    expect(sql).toContain("run.run_type = 'rss_opportunity_reservation'");
    expect(sql).toContain("'selectionPolicy', 'brand_wide'");
    expect(sql).not.toContain("run.model_usage ->> 'rssFeedId' = link_record.rss_feed_id::text");
    expect(sql).not.toContain("link_record.minimum_score");
    expect(sql).not.toContain("link_record.daily_generation_limit");
  });

  it("retains service-only and idempotent reservation behavior", () => {
    expect(sql).toContain("current_setting('request.jwt.claim.role', true)");
    expect(sql).toContain("scope = 'rss_generation_reservation'");
    expect(sql).toContain("Idempotency key was reused with a different request");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
  });

  it("supports opaque secret keys without broadening reservation execution", () => {
    expect(secretKeyCompatibilitySql).toContain("current_setting(''request.jwt.claims'', true)");
    expect(secretKeyCompatibilitySql).toContain(
      "'private.reserve_rss_generation(jsonb)'::regprocedure",
    );
    expect(secretKeyCompatibilitySql).toContain(
      "revoke all on function public.reserve_rss_generation(jsonb)",
    );
    expect(secretKeyCompatibilitySql).toContain(
      "grant execute on function public.reserve_rss_generation(jsonb)",
    );
    expect(secretKeyCompatibilitySql).not.toContain(
      "grant execute on function public.reserve_rss_generation(jsonb)\n  to authenticated",
    );
  });

  it("migrates reservation hashes to stable source-opportunity identity", () => {
    expect(stableIdentitySql).toContain("idempotency.scope = 'rss_generation_reservation'");
    expect(stableIdentitySql).toContain("run.model_usage ->> 'rssFeedId'");
    expect(stableIdentitySql).toContain("run.model_usage ->> 'sourceDocumentId'");
    expect(stableIdentitySql).toContain("run.entity_id");
    expect(stableIdentitySql).not.toContain("opportunityScore");
  });

  it("records instantaneous reservations as completed operations", () => {
    expect(completedReservationSql).toContain("E'      ''succeeded'',");
    expect(completedReservationSql).toContain("E'      status,\\n      completed_at,");
    expect(completedReservationSql).toContain("status in ('queued', 'running')");
    expect(completedReservationSql).toContain(
      "revoke all on function private.reserve_rss_generation(jsonb)",
    );
    expect(completedReservationSql).not.toContain(
      "grant execute on function public.reserve_rss_generation(jsonb)\n  to authenticated",
    );
  });

  it("does not let a policy edit reserve or count one opportunity twice", () => {
    expect(duplicateReservationSql).toContain("count(distinct reservation.entity_id)");
    expect(duplicateReservationSql).toContain(
      "when existing_run_id is not null then 'already_prepared'",
    );
    expect(duplicateReservationSql).toContain(
      "reservation.entity_id = (payload ->> 'opportunityId')::uuid",
    );
    expect(duplicateReservationSql).toContain("reservation.status = 'succeeded'");
    expect(duplicateReservationSql).toContain("eligibility_reason = 'already_prepared'");
    expect(duplicateReservationSql).toContain("current_setting('request.jwt.claims', true)");
    expect(duplicateReservationSql).toContain(
      "revoke all on function private.reserve_rss_generation(jsonb)",
    );
    expect(duplicateReservationSql).not.toContain(
      "grant execute on function public.reserve_rss_generation(jsonb)\n  to authenticated",
    );
  });
});
