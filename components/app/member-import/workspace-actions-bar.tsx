"use client";

import { useState } from "react";
import {
  LinkIcon,
  Loader2Icon,
  SearchIcon,
  SparklesIcon,
  UserPlusIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";

/**
 * Batch actions over the rows that still have no Workspace account.
 *
 * "Create accounts" is the primary button whenever unresolved rows remain —
 * which is exactly when the wizard footer demotes itself to `outline`, so
 * there is never more than one primary action on screen.
 */
export function WorkspaceActionsBar({
  unresolvedCount,
  selectedCount,
  hitCount,
  onLinkAll,
  searchDone,
  csvHeaders,
  searchColumnKeys,
  onSearchColumnsChange,
  onSearch,
  searching,
  searchProgress,
  sendWelcomeEmail,
  onSendWelcomeEmailChange,
  onProvision,
  provisioning,
}: {
  unresolvedCount: number;
  selectedCount: number;
  hitCount: number;
  onLinkAll: () => void;
  searchDone: boolean;
  csvHeaders: string[];
  searchColumnKeys: string[];
  onSearchColumnsChange: (keys: string[]) => void;
  onSearch: () => void;
  searching: boolean;
  searchProgress: { done: number; total: number } | null;
  sendWelcomeEmail: boolean;
  onSendWelcomeEmailChange: (value: boolean) => void;
  onProvision: () => void;
  provisioning: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const busy = searching || provisioning;

  // The funnel has three stops, and exactly one of them owns the primary
  // button at any moment. Creating an account for someone who already has one
  // is the expensive mistake, so pending directory hits always outrank Create.
  const stage: "search" | "link" | "create" =
    hitCount > 0 ? "link" : searchDone ? "create" : "search";

  return (
    <div className="flex flex-col gap-2">
      {stage === "link" ? (
        <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
          <SparklesIcon className="size-4 shrink-0 text-primary" />
          <span>
            Found{" "}
            <strong>
              {hitCount} possible match{hitCount !== 1 ? "es" : ""}
            </strong>{" "}
            in the directory. Link the ones that look right, then create
            accounts for anyone left.
          </span>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {stage === "create" ? (
            <>
              Create Google accounts for the{" "}
              <strong className="text-foreground">{unresolvedCount}</strong> row
              {unresolvedCount !== 1 ? "s" : ""} still unmatched, or link them
              by hand.
            </>
          ) : (
            <>
              <strong className="text-foreground">{unresolvedCount}</strong> row
              {unresolvedCount !== 1 ? "s" : ""} have no Workspace account.
              Search the directory first — some may already have one under a
              different email — then create accounts for whoever is left.
            </>
          )}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={stage === "search" ? "default" : "outline"}
            size="sm"
            disabled={busy}
          >
            <SearchIcon data-icon="inline-start" />
            Search unmatched by name
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72">
          <PopoverTitle className="text-sm">Search the directory</PopoverTitle>
          <PopoverDescription className="mt-1 text-xs">
            Pick the CSV columns to build a query from. Every unmatched row is
            searched.
          </PopoverDescription>
          <div className="mt-3 flex max-h-56 flex-col gap-1 overflow-auto">
            {csvHeaders.map((h) => (
              <Label
                key={h}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs font-normal hover:bg-muted/60"
              >
                <Checkbox
                  checked={searchColumnKeys.includes(h)}
                  onCheckedChange={(checked) =>
                    onSearchColumnsChange(
                      checked
                        ? [...searchColumnKeys, h]
                        : searchColumnKeys.filter((k) => k !== h),
                    )
                  }
                />
                <span className="font-mono">{h}</span>
              </Label>
            ))}
          </div>
          <Button
            size="sm"
            className="mt-3 w-full"
            disabled={searchColumnKeys.length === 0 || busy}
            onClick={onSearch}
          >
            <SearchIcon data-icon="inline-start" />
            Search {unresolvedCount} row{unresolvedCount !== 1 ? "s" : ""}
          </Button>
        </PopoverContent>
      </Popover>

      {hitCount > 0 && (
        <Button size="sm" disabled={busy} onClick={onLinkAll}>
          <LinkIcon data-icon="inline-start" />
          Link all {hitCount}
        </Button>
      )}

      {/* Creating accounts is irreversible and mails real people, so it
          confirms — and the welcome-email switch lives inside that confirm
          rather than floating in the toolbar where it was easy to miss. */}
      <Popover open={confirmOpen} onOpenChange={setConfirmOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={stage === "create" ? "default" : "outline"}
            size="sm"
            disabled={selectedCount === 0 || busy}
          >
            {provisioning ? (
              <Loader2Icon data-icon="inline-start" className="animate-spin" />
            ) : (
              <UserPlusIcon data-icon="inline-start" />
            )}
            Create {selectedCount} account{selectedCount !== 1 ? "s" : ""}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80">
          <PopoverTitle className="text-sm">
            Create {selectedCount} Google account
            {selectedCount !== 1 ? "s" : ""}?
          </PopoverTitle>
          <PopoverDescription className="mt-1 text-xs">
            This creates real accounts in your Google Workspace. They remain
            even if you cancel this import.
          </PopoverDescription>

          <Label className="mt-3 flex items-start gap-2.5 rounded-md border p-2.5 text-xs font-normal">
            <Switch
              checked={sendWelcomeEmail}
              onCheckedChange={onSendWelcomeEmailChange}
            />
            <span>
              <span className="font-medium">Send a welcome email</span>
              <span className="mt-0.5 block text-muted-foreground">
                Each new account is emailed its temporary password.
              </span>
            </span>
          </Label>

          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setConfirmOpen(false);
                onProvision();
              }}
            >
              Create {selectedCount} account{selectedCount !== 1 ? "s" : ""}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
      </div>

      {searching && searchProgress ? (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          Searching… {searchProgress.done} of {searchProgress.total}
        </p>
      ) : null}
    </div>
  );
}
