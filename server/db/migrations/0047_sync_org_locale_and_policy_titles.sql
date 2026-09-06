-- Repair organizations whose `locale` predates the locale work, then retitle
-- the policy documents 0046 seeded off that stale value.
--
-- `organizations.locale` is seeded from `DEFAULT_LOCALE` at setup, but rows
-- created before that seeding existed still hold the 'en' default. On a Czech
-- deployment the whole signed-out surface already renders from `DEFAULT_LOCALE`
-- (see lib/i18n/index.ts), so the stale column disagrees with everything the
-- user actually sees — and 0046 keyed the document titles off it, because SQL
-- has no access to the environment.
--
-- `members_sort_locale` is the signal: an org that configured Czech collation
-- did not mean to stay on the English locale default. That is inferable in SQL,
-- where `DEFAULT_LOCALE` is not.

-- 1. Sync the stale locale.
UPDATE "organizations"
SET "locale" = 'cs', "updated_at" = now()
WHERE "locale" = 'en'
  AND "members_sort_locale" LIKE 'cs%';
--> statement-breakpoint

-- 2. Retitle the seeded documents, but only where the title is still the
--    untouched English default from 0046. An admin who has already renamed a
--    document in the Legal tab keeps their wording.
--
--    The Czech strings match `legal.termsTitle` / `legal.privacyTitle` in
--    lib/i18n/messages.ts, so the document title and the page chrome agree.
UPDATE "policy_documents" pd
SET "title" = 'Podmínky služby', "updated_at" = now()
FROM "organizations" o
WHERE o."id" = pd."org_id"
  AND o."locale" = 'cs'
  AND pd."kind" = 'terms'
  AND pd."title" IN ('Terms of Service', 'Terms of service');
--> statement-breakpoint

UPDATE "policy_documents" pd
SET "title" = 'Zásady ochrany osobních údajů', "updated_at" = now()
FROM "organizations" o
WHERE o."id" = pd."org_id"
  AND o."locale" = 'cs'
  AND pd."kind" = 'privacy'
  AND pd."title" IN ('Privacy Policy', 'Privacy policy');
