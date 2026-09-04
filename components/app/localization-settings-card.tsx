"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { toast } from "sonner";

import { sortLocaleOptions, type SortLocaleTag } from "@/lib/collation";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveLocalizationSettingsAction } from "@/server/actions/organization-settings";

export type LocalizationSettingsState = {
  membersSortLocale: SortLocaleTag;
};

export function LocalizationSettingsCard({
  state,
}: {
  state: LocalizationSettingsState;
}) {
  const router = useRouter();
  const [membersSortLocale, setMembersSortLocale] = useState(state.membersSortLocale);

  const saveAction = useAction(saveLocalizationSettingsAction, {
    onSuccess() {
      toast.success("Localization settings saved.");
      router.refresh();
    },
    onError({ error }) {
      toast.error(error.serverError ?? "Could not save localization settings.");
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <Field>
        <FieldLabel htmlFor="members-sort-locale">Member name sorting</FieldLabel>
        <FieldContent>
          <Select
            value={membersSortLocale}
            onValueChange={(value) => setMembersSortLocale(value as SortLocaleTag)}
          >
            <SelectTrigger id="members-sort-locale" className="sm:max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortLocaleOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            Alphabetical order differs by language. Czech sorts Š after all of S
            (Sever, Sokol, Svoboda, Šimek), while English sorts it inside S
            (Sever, Šimek, Sokol, Svoboda). Pick the language your member names
            are in.
          </FieldDescription>
        </FieldContent>
      </Field>

      <div>
        <Button
          onClick={() => saveAction.execute({ membersSortLocale })}
          disabled={saveAction.isPending}
        >
          {saveAction.isPending ? "Saving..." : "Save localization settings"}
        </Button>
      </div>
    </div>
  );
}
