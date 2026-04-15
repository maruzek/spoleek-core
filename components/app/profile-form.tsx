"use client";

import { useAction } from "next-safe-action/hooks";

import { FormField } from "@/components/forms/form-field";
import { Button } from "@/components/ui/button";
import { updateProfileAction } from "@/server/actions/member";

type ProfileFormProps = {
  fullName: string;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  countryCode: string;
};

export function ProfileForm(props: ProfileFormProps) {
  const profileAction = useAction(updateProfileAction);
  const fieldErrors = profileAction.result.validationErrors;

  return (
    <form
      className="grid gap-5 rounded-4xl border border-slate-950/10 bg-white p-8 shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)]"
      action={async (formData) => {
        await profileAction.executeAsync({
          fullName: String(formData.get("fullName") ?? ""),
          phone: String(formData.get("phone") ?? ""),
          addressLine1: String(formData.get("addressLine1") ?? ""),
          addressLine2: String(formData.get("addressLine2") ?? ""),
          city: String(formData.get("city") ?? ""),
          postalCode: String(formData.get("postalCode") ?? ""),
          countryCode: String(formData.get("countryCode") ?? "CZ"),
        });
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <FormField
          name="fullName"
          label="Full name"
          defaultValue={props.fullName}
          error={fieldErrors?.fullName?._errors?.[0]}
          required
        />
        <FormField
          name="phone"
          label="Phone"
          defaultValue={props.phone ?? ""}
        />
        <FormField
          name="addressLine1"
          label="Address line 1"
          defaultValue={props.addressLine1 ?? ""}
        />
        <FormField
          name="addressLine2"
          label="Address line 2"
          defaultValue={props.addressLine2 ?? ""}
        />
        <FormField name="city" label="City" defaultValue={props.city ?? ""} />
        <FormField
          name="postalCode"
          label="Postal code"
          defaultValue={props.postalCode ?? ""}
        />
      </div>

      <input type="hidden" name="countryCode" value={props.countryCode} />

      {profileAction.result.serverError ? (
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {profileAction.result.serverError}
        </p>
      ) : null}
      {profileAction.hasSucceeded ? (
        <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Profile updated.
        </p>
      ) : null}

      <Button type="submit" size="lg" disabled={profileAction.isPending}>
        {profileAction.isPending ? "Saving..." : "Save profile"}
      </Button>
    </form>
  );
}
