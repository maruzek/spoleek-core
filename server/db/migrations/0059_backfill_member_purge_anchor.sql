-- Members deleted before 0058 have no `purge_after`, and the purge job reads
-- that column rather than recomputing `deleted_at + 30 days`. Without this they
-- would sit in the grace window forever, which is the one failure mode a
-- retention anchor exists to prevent.
--
-- 30 days is MEMBER_SOFT_DELETE_RETENTION_DAYS, the window these rows were
-- deleted under. Rows already past it get a `purge_after` in the past and are
-- picked up by the next run, which is correct: their window has expired.
UPDATE "tenant_members"
SET "purge_after" = "deleted_at" + INTERVAL '30 days'
WHERE "status" = 'deleted'
  AND "deleted_at" IS NOT NULL
  AND "purge_after" IS NULL;
--> statement-breakpoint
-- Every existing soft delete came from `deleteMemberAction` or
-- `bulkDeleteMembersAction`, both of which are an administrator acting on the
-- roster. No other path wrote this status.
UPDATE "tenant_members"
SET "deletion_reason" = 'admin_request'
WHERE "status" = 'deleted'
  AND "deletion_reason" IS NULL;
