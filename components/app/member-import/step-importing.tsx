import { Spinner } from "@/components/ui/spinner";

export function StepImporting({ rowCount }: { rowCount: number }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-4">
      <Spinner className="size-10 text-primary" />
      <div className="text-center">
        <p className="text-base font-semibold">Importing members…</p>
        <p className="text-sm text-muted-foreground">
          Processing {rowCount} row{rowCount !== 1 ? "s" : ""}. This may take a
          moment.
        </p>
      </div>
    </div>
  );
}
