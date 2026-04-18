export const DEFAULT_WORKSPACE_EMAIL_TEMPLATE = "{first}.{last}";

function normalizePart(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "");
}

export function renderWorkspaceEmailLocalPart(params: {
  template: string;
  firstName: string;
  lastName: string;
}) {
  const first = normalizePart(params.firstName);
  const last = normalizePart(params.lastName);
  const initial = first.charAt(0) || "";
  const lastInitial = last.charAt(0) || "";

  const rendered = params.template
    .replace(/\{first\}/gi, first)
    .replace(/\{last\}/gi, last)
    .replace(/\{initial\}/gi, initial)
    .replace(/\{f\}/gi, initial)
    .replace(/\{l\}/gi, lastInitial);

  const cleaned = rendered
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/\.+/g, ".")
    .replace(/^[._-]+|[._-]+$/g, "");

  return cleaned || first || last || "user";
}

export function buildWorkspaceEmail(params: {
  template: string;
  firstName: string;
  lastName: string;
  domain: string;
}) {
  const local = renderWorkspaceEmailLocalPart({
    template: params.template || DEFAULT_WORKSPACE_EMAIL_TEMPLATE,
    firstName: params.firstName,
    lastName: params.lastName,
  });
  return `${local}@${params.domain.trim().toLowerCase()}`;
}
