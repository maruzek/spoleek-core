-- Rewrite spanning period labels ("2026/2027") to calendar-year labels ("2026").
--
-- `getPeriodLabel()` used to emit a span unconditionally. It now follows
-- `organizations.membership_period_mode`, which defaults to `calendar_year`, so
-- existing rows would no longer match the keys the generator produces and every
-- member who already paid this period would be billed a second time.
--
-- The starting year is kept, not the ending one: a payment issued during the
-- 2026/2027 span was issued in 2026. `period_key` carries the same label as its
-- prefix ("2026/2027:org:<uuid>"), so it is rewritten in step with it.
UPDATE "member_payments"
SET
  "period_label" = regexp_replace("period_label", '^(\d{4})/\d{4}$', '\1'),
  "period_key" = regexp_replace("period_key", '^(\d{4})/\d{4}', '\1'),
  "updated_at" = now()
WHERE "period_label" ~ '^\d{4}/\d{4}$';
