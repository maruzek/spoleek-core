-- Backfill the versioned policy tables from the single mutable
-- `organization_policies` row. See docs/legal-policies.md §3.1.
--
-- `organization_policies` keeps its columns for now: the join form, the legal
-- pages, the settings form and the registration emails still read them. They
-- are dropped by MAR-126 / MAR-129, once the last readers are gone, so that
-- main stays deployable between phases.
--
-- Every statement is idempotent (ON CONFLICT DO NOTHING against the natural
-- keys), so a partial run can be repeated safely.

-- 1. One document per kind, per organization.
--
-- The title is NOT taken from `terms_of_service_label` — that column holds a
-- consent checkbox label ("I agree with the ... terms"), which reads as
-- nonsense as a page heading. A neutral title is used instead, localised off
-- `organizations.locale`, and admins rename it in the Legal settings tab.
INSERT INTO "policy_documents" (
  "org_id", "kind", "slug", "title", "requires_acceptance", "is_active",
  "sort_order", "created_at", "updated_at"
)
SELECT
  o."id",
  'terms'::"policy_document_kind",
  'terms',
  CASE WHEN o."locale" = 'cs' THEN 'Podmínky služby' ELSE 'Terms of service' END,
  -- An agreement: the member accepts it.
  true,
  true,
  0,
  o."created_at",
  now()
FROM "organizations" o
JOIN "organization_policies" op ON op."org_id" = o."id"
ON CONFLICT ("org_id", "slug") DO NOTHING;
--> statement-breakpoint

INSERT INTO "policy_documents" (
  "org_id", "kind", "slug", "title", "requires_acceptance", "is_active",
  "sort_order", "created_at", "updated_at"
)
SELECT
  o."id",
  'privacy'::"policy_document_kind",
  'privacy',
  CASE
    WHEN o."locale" = 'cs' THEN 'Zásady ochrany osobních údajů'
    ELSE 'Privacy policy'
  END,
  -- A disclosure: the member confirms having read it. Nobody can "agree to" a
  -- statement of fact. It still gates the portal; only the wording differs.
  false,
  true,
  1,
  o."created_at",
  now()
FROM "organizations" o
JOIN "organization_policies" op ON op."org_id" = o."id"
ON CONFLICT ("org_id", "slug") DO NOTHING;
--> statement-breakpoint

-- 2. One published version per document, carrying the existing text.
--
-- The stored text is plain, rendered with `whitespace-pre-line`. It is escaped
-- and wrapped in paragraphs here so the new HTML renderer produces the same
-- visual result: blank lines become paragraph breaks, single newlines <br />.
INSERT INTO "policy_versions" (
  "document_id", "version", "body_html", "summary_of_changes", "status",
  "is_material_change", "effective_from", "published_at", "created_at", "updated_at"
)
SELECT
  pd."id",
  op."version",
  '<p>' || replace(
    replace(
      replace(
        -- Escape first, or the escaping would eat the tags inserted below.
        replace(
          replace(
            replace(
              replace(
                CASE
                  WHEN pd."kind" = 'terms' THEN op."terms_of_service_text"
                  ELSE op."privacy_policy_text"
                END,
                E'\r\n', E'\n'
              ),
              '&', '&amp;'
            ),
            '<', '&lt;'
          ),
          '>', '&gt;'
        ),
        -- Sentinel for the paragraph break, so the <br /> pass below cannot
        -- rewrite the newlines that separate paragraphs.
        E'\n\n', E'\x01'
      ),
      E'\n', '<br />'
    ),
    E'\x01', E'</p>\n<p>'
  ) || '</p>',
  '',
  'published'::"policy_version_status",
  true,
  o."created_at",
  o."created_at",
  o."created_at",
  now()
FROM "policy_documents" pd
JOIN "organizations" o ON o."id" = pd."org_id"
JOIN "organization_policies" op ON op."org_id" = pd."org_id"
WHERE pd."kind" IN ('terms', 'privacy')
ON CONFLICT ("document_id", "version") DO NOTHING;
--> statement-breakpoint

-- 3. Acknowledgements for members who really did accept something.
--
-- Members with a NULL timestamp get NO row. Imported and admin-created members
-- have never been shown anything, and synthesising a consent that did not
-- happen is worse than an empty record — it is the one thing that reads as bad
-- faith. They are collected at first login by the portal gate (MAR-128).
--
-- `tenant_members.accepted_policy_version` is not matched against
-- `policy_versions.version`: exactly one version has ever existed per document,
-- so every historical acceptance maps to it by construction.
INSERT INTO "member_policy_acknowledgements" (
  "org_id", "member_id", "policy_version_id", "acknowledged_at", "method",
  "created_at", "updated_at"
)
SELECT
  tm."org_id",
  tm."id",
  pv."id",
  CASE
    WHEN pd."kind" = 'terms' THEN tm."accepted_terms_at"
    ELSE tm."accepted_privacy_at"
  END,
  'registration'::"policy_acknowledgement_method",
  now(),
  now()
FROM "tenant_members" tm
JOIN "policy_documents" pd ON pd."org_id" = tm."org_id"
JOIN "policy_versions" pv ON pv."document_id" = pd."id"
WHERE
  (pd."kind" = 'terms' AND tm."accepted_terms_at" IS NOT NULL)
  OR (pd."kind" = 'privacy' AND tm."accepted_privacy_at" IS NOT NULL)
ON CONFLICT ("member_id", "policy_version_id") DO NOTHING;
