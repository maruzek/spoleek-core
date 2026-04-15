"use client";

import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";

import { FormField, FormTextarea } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { createOrganizationSetupAction } from "@/server/actions/setup";

export function SetupForm() {
  const router = useRouter();
  const setupAction = useAction(createOrganizationSetupAction, {
    onSuccess() {
      router.push("/admin/members");
      router.refresh();
    },
  });

  const fieldErrors = setupAction.result.validationErrors;

  return (
    <form
      className="grid gap-6 rounded-4xl border border-slate-950/10 bg-white p-8 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)]"
      action={async (formData) => {
        await setupAction.executeAsync({
          organizationName: String(formData.get("organizationName") ?? ""),
          organizationSlug: String(formData.get("organizationSlug") ?? ""),
          legalName: String(formData.get("legalName") ?? ""),
          primaryEmail: String(formData.get("primaryEmail") ?? ""),
          website: String(formData.get("website") ?? ""),
          termsLabel: String(formData.get("termsLabel") ?? ""),
          termsText: String(formData.get("termsText") ?? ""),
          privacyLabel: String(formData.get("privacyLabel") ?? ""),
          privacyText: String(formData.get("privacyText") ?? ""),
        });
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          name="organizationName"
          label="Organization name"
          placeholder="Praha River Scouts"
          error={fieldErrors?.organizationName?._errors?.[0]}
          required
        />
        <FormField
          name="organizationSlug"
          label="Organization slug"
          placeholder="praha-river-scouts"
          hint="Used for stable internal tenant identity."
          error={fieldErrors?.organizationSlug?._errors?.[0]}
          required
        />
        <FormField
          name="legalName"
          label="Legal entity name"
          placeholder="Praha River Scouts z.s."
          error={fieldErrors?.legalName?._errors?.[0]}
          required
        />
        <FormField
          name="primaryEmail"
          label="Primary admin email"
          type="email"
          placeholder="hello@spoleek.example"
          error={fieldErrors?.primaryEmail?._errors?.[0]}
          required
        />
      </div>

      <FormField
        name="website"
        label="Website"
        placeholder="https://example.org"
        error={fieldErrors?.website?._errors?.[0]}
      />

      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          name="termsLabel"
          label="Terms checkbox label"
          placeholder="I agree to the organization terms."
          error={fieldErrors?.termsLabel?._errors?.[0]}
          required
        />
        <FormField
          name="privacyLabel"
          label="Privacy checkbox label"
          placeholder="I agree to the privacy policy."
          error={fieldErrors?.privacyLabel?._errors?.[0]}
          required
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FormTextarea
          name="termsText"
          label="Initial terms of service"
          error={fieldErrors?.termsText?._errors?.[0]}
          required
        />
        <FormTextarea
          name="privacyText"
          label="Initial privacy policy"
          error={fieldErrors?.privacyText?._errors?.[0]}
          required
        />
      </div>

      {setupAction.result.serverError ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {setupAction.result.serverError}
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={setupAction.isPending}>
        {setupAction.isPending ? "Setting up..." : "Create organization"}
      </Button>
    </form>
  );
}
