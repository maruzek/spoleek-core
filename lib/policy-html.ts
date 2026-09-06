/**
 * The one definition of what a legal document may contain.
 *
 * Both the editor (`components/app/policy-editor.tsx`) and the sanitizer
 * (`server/lib/policy-html.ts`) build from these constants, so the toolbar can
 * never offer a mark the sanitizer would strip on publish — a mismatch there
 * looks to the admin like the editor silently losing their work.
 *
 * The schema is deliberately tiny. Legal documents need headings, paragraphs,
 * lists, emphasis and links, and nothing else. The narrowness is the point: a
 * published version is immutable and has to render identically years later, and
 * every additional construct is another thing that can drift.
 */

/** Block and inline tags a published document may contain. */
export const POLICY_ALLOWED_TAGS = [
  "h2",
  "h3",
  "p",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "a",
  "br",
] as const;

/** Only links carry attributes, and only these. */
export const POLICY_ALLOWED_ATTRIBUTES = {
  a: ["href", "target", "rel"],
} as const;

/**
 * URL schemes permitted in `href`.
 *
 * `mailto` earns its place — a privacy notice must name a contact for data
 * subject requests. Everything else (`javascript:`, `data:`, `file:`) is a
 * script vector in a document that renders on a public, signed-out page.
 */
export const POLICY_ALLOWED_SCHEMES = ["http", "https", "mailto"] as const;

/** Heading levels the editor offers. `h1` belongs to the page, not the body. */
export const POLICY_HEADING_LEVELS = [2, 3] as const;

export type PolicyHeadingLevel = (typeof POLICY_HEADING_LEVELS)[number];
