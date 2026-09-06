import { describe, expect, it } from "vitest";

import { isPolicyHtmlEmpty, sanitizePolicyHtml } from "@/server/lib/policy-html";

/**
 * This is the security boundary for legal documents: the output lands in
 * `policy_versions.body_html` and is rendered verbatim, forever, on a public
 * signed-out page. Nothing sanitizes again on read, so anything that survives
 * here survives for the life of the version.
 */
describe("sanitizePolicyHtml", () => {
  it("keeps the whole allowed schema", () => {
    const input =
      "<h2>Heading</h2><h3>Sub</h3><p>Text with <strong>bold</strong> and <em>italic</em>.</p>" +
      "<ul><li>one</li></ul><ol><li>two</li></ol><p>a<br />b</p>";

    expect(sanitizePolicyHtml(input)).toBe(input);
  });

  it("strips tags outside the schema but keeps their text", () => {
    // The text is the legal content; only the construct is unsupported.
    expect(sanitizePolicyHtml("<blockquote>Quoted duty</blockquote>")).toBe(
      "Quoted duty",
    );
    expect(sanitizePolicyHtml("<h1>Title</h1>")).toBe("Title");
    expect(sanitizePolicyHtml("<div><p>Kept</p></div>")).toBe("<p>Kept</p>");
  });

  it("drops script content instead of leaving it as visible text", () => {
    expect(sanitizePolicyHtml("<p>Before</p><script>alert(1)</script>")).toBe(
      "<p>Before</p>",
    );
    expect(sanitizePolicyHtml("<style>body{display:none}</style><p>A</p>")).toBe(
      "<p>A</p>",
    );
  });

  it("removes event handlers and stray attributes", () => {
    expect(sanitizePolicyHtml('<p onclick="steal()">Text</p>')).toBe("<p>Text</p>");
    expect(sanitizePolicyHtml('<p class="tracking" id="x">Text</p>')).toBe(
      "<p>Text</p>",
    );
  });

  it("rejects dangerous href schemes", () => {
    expect(sanitizePolicyHtml('<p><a href="javascript:alert(1)">x</a></p>')).toBe(
      "<p><a target=\"_blank\" rel=\"noopener noreferrer\">x</a></p>",
    );
    expect(
      sanitizePolicyHtml('<p><a href="data:text/html,<script>">x</a></p>'),
    ).toBe("<p><a target=\"_blank\" rel=\"noopener noreferrer\">x</a></p>");
  });

  it("rejects protocol-relative hrefs, which are live off-site links", () => {
    expect(sanitizePolicyHtml('<p><a href="//evil.test/x">x</a></p>')).toBe(
      "<p><a target=\"_blank\" rel=\"noopener noreferrer\">x</a></p>",
    );
  });

  it("keeps http, https and mailto links", () => {
    // mailto earns its place: a privacy notice must name a contact for
    // data-subject requests.
    expect(sanitizePolicyHtml('<p><a href="mailto:gdpr@toptym.cz">write</a></p>')).toBe(
      '<p><a href="mailto:gdpr@toptym.cz" target="_blank" rel="noopener noreferrer">write</a></p>',
    );
    expect(sanitizePolicyHtml('<p><a href="https://toptym.cz">site</a></p>')).toBe(
      '<p><a href="https://toptym.cz" target="_blank" rel="noopener noreferrer">site</a></p>',
    );
  });

  it("forces the opener guard even when the input sets its own rel", () => {
    // `rel` is in the allow-list, so an admin could otherwise publish a link
    // that opens a new tab with a live `window.opener`.
    expect(
      sanitizePolicyHtml('<p><a href="https://x.test" rel="opener">x</a></p>'),
    ).toBe(
      '<p><a href="https://x.test" rel="noopener noreferrer" target="_blank">x</a></p>',
    );
  });
});

describe("isPolicyHtmlEmpty", () => {
  it("treats an empty Tiptap document as empty", () => {
    // Tiptap serialises an empty editor as <p></p>, so a length check on the
    // HTML would happily publish a blank legal document.
    expect(isPolicyHtmlEmpty("<p></p>")).toBe(true);
    expect(isPolicyHtmlEmpty("")).toBe(true);
    expect(isPolicyHtmlEmpty("<p>   </p>")).toBe(true);
    expect(isPolicyHtmlEmpty("<p>&nbsp;</p>")).toBe(true);
  });

  it("treats real content as non-empty", () => {
    expect(isPolicyHtmlEmpty("<p>Text</p>")).toBe(false);
    expect(isPolicyHtmlEmpty("<h2>Heading</h2>")).toBe(false);
  });
});
