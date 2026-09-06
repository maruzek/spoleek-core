-- Drop the legacy policy columns. See docs/legal-policies.md §3.1.
--
-- These columns are the only remaining copy of the pre-migration consent
-- record, so this is a one-way door. The guard below refuses the migration on
-- any database where a member still carries a consent timestamp with no
-- matching acknowledgement row -- that would mean 0046 never ran, or ran
-- against different data, and dropping would destroy the evidence rather than
-- move it.
DO $$
DECLARE
  orphaned integer;
BEGIN
  SELECT count(*) INTO orphaned
  FROM tenant_members tm
  WHERE tm.accepted_terms_at IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM member_policy_acknowledgements a
      JOIN policy_versions pv ON pv.id = a.policy_version_id
      JOIN policy_documents pd ON pd.id = pv.document_id
      WHERE a.member_id = tm.id AND pd.kind = 'terms'
    );

  IF orphaned > 0 THEN
    RAISE EXCEPTION
      '% member(s) have accepted_terms_at with no acknowledgement row. Run the 0046 backfill before dropping these columns.', orphaned;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "organization_policies" DROP COLUMN "terms_of_service_label";--> statement-breakpoint
ALTER TABLE "organization_policies" DROP COLUMN "terms_of_service_text";--> statement-breakpoint
ALTER TABLE "organization_policies" DROP COLUMN "privacy_policy_label";--> statement-breakpoint
ALTER TABLE "organization_policies" DROP COLUMN "privacy_policy_text";--> statement-breakpoint
ALTER TABLE "organization_policies" DROP COLUMN "version";--> statement-breakpoint
ALTER TABLE "tenant_members" DROP COLUMN "accepted_terms_at";--> statement-breakpoint
ALTER TABLE "tenant_members" DROP COLUMN "accepted_privacy_at";--> statement-breakpoint
ALTER TABLE "tenant_members" DROP COLUMN "accepted_policy_version";