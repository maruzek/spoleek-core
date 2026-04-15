"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";

import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { joinOrganizationAction } from "@/server/actions/member";

export function JoinForm({
  termsLabel,
  privacyLabel,
}: {
  termsLabel: string;
  privacyLabel: string;
}) {
  const router = useRouter();
  const joinAction = useAction(joinOrganizationAction, {
    onSuccess() {
      router.push("/portal");
      router.refresh();
    },
  });

  const fieldErrors = joinAction.result.validationErrors;

  return (
    <form
      className="grid gap-5 rounded-4xl border border-slate-950/10 bg-white p-8 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)]"
      action={async (formData) => {
        await joinAction.executeAsync({
          phone: String(formData.get("phone") ?? ""),
          addressLine1: String(formData.get("addressLine1") ?? ""),
          city: String(formData.get("city") ?? ""),
          postalCode: String(formData.get("postalCode") ?? ""),
          acceptTerms: formData.get("acceptTerms") === "on",
          acceptPrivacy: formData.get("acceptPrivacy") === "on",
        });
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <FormField name="phone" label="Phone number" placeholder="+420..." />
        <FormField name="addressLine1" label="Address" placeholder="Street and number" />
        <FormField name="city" label="City" placeholder="Prague" />
        <FormField name="postalCode" label="Postal code" placeholder="11000" />
      </div>

      <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
        <input
          name="acceptTerms"
          type="checkbox"
          className="mt-1 size-4 rounded border-slate-300 text-emerald-700"
          required
        />
        <span>{termsLabel}</span>
      </label>
      {fieldErrors?.acceptTerms?._errors?.[0] ? (
        <p className="text-sm text-rose-600">
          {fieldErrors.acceptTerms._errors[0]}
        </p>
      ) : null}

      <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
        <input
          name="acceptPrivacy"
          type="checkbox"
          className="mt-1 size-4 rounded border-slate-300 text-emerald-700"
          required
        />
        <span>{privacyLabel}</span>
      </label>
      {fieldErrors?.acceptPrivacy?._errors?.[0] ? (
        <p className="text-sm text-rose-600">
          {fieldErrors.acceptPrivacy._errors[0]}
        </p>
      ) : null}

      {joinAction.result.serverError ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {joinAction.result.serverError}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={joinAction.isPending}>
        {joinAction.isPending ? "Submitting..." : "Join organization"}
      </Button>
    </form>
  );
}
