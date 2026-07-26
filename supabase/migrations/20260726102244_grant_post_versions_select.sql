-- Immutable post versions are reviewer-visible through brand-scoped RLS.
-- The initial migration created the SELECT policy but accidentally omitted the
-- matching Data API grant, causing authorized post-review pages to fail with
-- HTTP 403 while the parent draft remained readable.
grant select on public.post_versions to authenticated;
