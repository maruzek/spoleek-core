import sanitizeHtml from "sanitize-html";

import {
  POLICY_ALLOWED_ATTRIBUTES,
  POLICY_ALLOWED_SCHEMES,
  POLICY_ALLOWED_TAGS,
} from "@/lib/policy-html";

/**
 * Sanitizes a policy body on the way in, once, at publish time.
 *
 * The result is what lands in `policy_versions.body_html` and what the public
 * page renders verbatim. Nothing re-sanitizes on read: an archived version has
 * to render exactly as it did when somebody accepted it, and running it back
 * through a current-day pipeline would let "immutable" drift the first time
 * this library is upgraded.
 *
 * That makes this the security boundary. The editor's own restrictions are a
 * convenience — a determined admin can POST whatever they like to the action —
 * so treat every input as hostile HTML.
 */
export function sanitizePolicyHtml(input: string): string {
  return sanitizeHtml(input, {
    allowedTags: [...POLICY_ALLOWED_TAGS],
    allowedAttributes: {
      a: [...POLICY_ALLOWED_ATTRIBUTES.a],
    },
    allowedSchemes: [...POLICY_ALLOWED_SCHEMES],
    // A protocol-relative `//evil.test` href inherits the page's scheme and is
    // a live off-site link, so it is not "relative" in any useful sense.
    allowProtocolRelative: false,
    // Drop the contents of anything removed. Without this, stripping a
    // <script> would leave its source visible as text in the document body.
    nonTextTags: ["style", "script", "textarea", "option", "noscript"],
    transformTags: {
      // Every link leaves the app, so every link gets the full opener guard.
      // Forced here rather than trusted from the input: `rel` is in the
      // allow-list, so an admin could otherwise publish a link without it.
      a: (tagName, attribs) => ({
        tagName,
        attribs: {
          ...attribs,
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
    },
  }).trim();
}

/**
 * True when a body has no human-readable content.
 *
 * Tiptap serialises an empty document as `<p></p>`, so a "did you write
 * anything" check cannot be a length test on the HTML. Publishing an empty
 * legal document is always a mistake, and the DB default is an empty string,
 * which would otherwise sail through as a valid draft.
 */
export function isPolicyHtmlEmpty(html: string): boolean {
  return (
    sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
      .replace(/&nbsp;/g, " ")
      .trim().length === 0
  );
}
