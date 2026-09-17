import { describe, expect, it } from "vitest";

import {
  validateSubmission,
  type LiveField,
  type ValidationQuestion,
} from "@/lib/forms/validation";

let seq = 0;
const question = (
  overrides: Partial<ValidationQuestion> & Pick<ValidationQuestion, "type">,
): ValidationQuestion => ({
  id: `q${++seq}`,
  kind: "input",
  label: "Q",
  options: [],
  constraints: {},
  required: false,
  memberFieldId: null,
  ...overrides,
});

const section = (id = `s${++seq}`): ValidationQuestion => ({
  id,
  kind: "section",
  label: "Section",
  type: null,
  options: [],
  constraints: {},
  required: false,
  memberFieldId: null,
});

const noFields = new Map<string, LiveField>();

const run = (
  questions: ValidationQuestion[],
  answers: Record<string, unknown>,
  liveFieldsById = noFields,
) => validateSubmission({ questions, liveFieldsById, answers });

const ok = (result: ReturnType<typeof run>) => {
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return Object.fromEntries(result.values);
};

const errors = (result: ReturnType<typeof run>) => {
  if (result.ok) throw new Error("expected errors");
  return result.errors;
};

describe("validateSubmission", () => {
  it("normalizes every type", () => {
    const qs = [
      question({ id: "text", type: "text" }),
      question({ id: "textarea", type: "textarea" }),
      question({ id: "boolean", type: "boolean" }),
      question({ id: "number", type: "number" }),
      question({ id: "email", type: "email" }),
      question({ id: "phone", type: "phone" }),
      question({ id: "date", type: "date" }),
      question({ id: "select", type: "select", options: ["a", "b"] }),
      question({ id: "multi", type: "multi_select", options: ["a", "b", "c"] }),
    ];
    expect(
      ok(
        run(qs, {
          text: "  hello ",
          textarea: "multi\nline",
          boolean: "on",
          number: "42",
          email: "a@b.cz",
          phone: "+420 777 000 000",
          date: "2026-09-13",
          select: "b",
          multi: ["a", "c"],
        }),
      ),
    ).toEqual({
      text: "hello",
      textarea: "multi\nline",
      boolean: true,
      number: 42,
      email: "a@b.cz",
      phone: "+420 777 000 000",
      date: "2026-09-13T00:00:00.000Z",
      select: "b",
      multi: ["a", "c"],
    });
  });

  it("rejects malformed values with the field's label in the message", () => {
    const qs = [
      question({ id: "n", type: "number", label: "Age" }),
      question({ id: "e", type: "email", label: "Email" }),
      question({ id: "d", type: "date", label: "Born" }),
    ];
    expect(errors(run(qs, { n: "abc", e: "nope", d: "someday" }))).toEqual({
      n: "Age must be a valid number.",
      e: "Email must be a valid email address.",
      d: "Born must be a valid date.",
    });
  });

  it("applies constraints", () => {
    const qs = [
      question({ id: "n", type: "number", label: "Seats", constraints: { min: 1, max: 4 } }),
      question({ id: "t", type: "text", label: "Code", constraints: { maxLength: 3 } }),
      question({
        id: "m",
        type: "multi_select",
        label: "Days",
        options: ["mo", "tu", "we"],
        constraints: { minSelected: 2 },
      }),
    ];
    expect(errors(run(qs, { n: 5, t: "abcd", m: ["mo"] }))).toEqual({
      n: "Seats must be at most 4.",
      t: "Code must be at most 3 characters.",
      m: "Days needs at least 2 options selected.",
    });
  });

  it("enforces required and stores blanks as null otherwise", () => {
    const qs = [
      question({ id: "r", type: "text", label: "Name", required: true }),
      question({ id: "b", type: "boolean", label: "Agree", required: true }),
      question({ id: "o", type: "text" }),
    ];
    expect(errors(run(qs, { r: "  ", b: false }))).toEqual({
      r: "Name is required.",
      b: "Agree is required.",
    });
    expect(ok(run([qs[2]!], {}))).toEqual({ o: null });
  });

  it("rejects values outside the option list", () => {
    const qs = [
      question({ id: "s", type: "select", label: "Size", options: ["S", "M"] }),
      question({ id: "m", type: "multi_select", label: "Days", options: ["mo", "tu"] }),
    ];
    expect(errors(run(qs, { s: "XL", m: ["mo", "fr"] }))).toEqual({
      s: "Size must be one of the listed options.",
      m: "Days must be one of the listed options.",
    });
    expect(ok(run(qs, { s: "M", m: ["tu"] }))).toEqual({ s: "M", m: ["tu"] });
  });

  it("skips sections and refuses answers addressed to them", () => {
    const qs = [section("s1"), question({ id: "t", type: "text" })];
    expect(ok(run(qs, { t: "x" }))).toEqual({ t: "x" });
    expect(errors(run(qs, { t: "x", s1: "hello" }))).toEqual({
      s1: "This question is not on the form.",
    });
  });

  it("rejects unknown question ids", () => {
    expect(errors(run([question({ id: "t", type: "text" })], { t: "x", zzz: 1 }))).toEqual({
      zzz: "This question is not on the form.",
    });
  });

  it("validates a linked question against the live field, not the snapshot", () => {
    const linked = question({
      id: "l",
      type: "text",
      label: "Shirt",
      memberFieldId: "f1",
      options: [],
      constraints: { maxLength: 100 },
    });
    // The field became a select since the question was saved.
    const live = new Map<string, LiveField>([
      ["f1", { type: "select", options: ["S", "M", "L"], constraints: {} }],
    ]);
    expect(errors(run([linked], { l: "XXL" }, live))).toEqual({
      l: "Shirt must be one of the listed options.",
    });
    expect(ok(run([linked], { l: "M" }, live))).toEqual({ l: "M" });
  });

  it("falls back to the snapshot when the linked field is gone", () => {
    const linked = question({ id: "l", type: "number", memberFieldId: "gone", constraints: { max: 2 } });
    expect(errors(run([linked], { l: 3 }))).toEqual({ l: "Q must be at most 2." });
  });

  it("returns every error at once", () => {
    const qs = [
      question({ id: "a", type: "text", label: "A", required: true }),
      question({ id: "b", type: "number", label: "B" }),
    ];
    expect(Object.keys(errors(run(qs, { b: "x" })))).toEqual(["a", "b"]);
  });
});
