import { AppPage } from "@/components/app/app-page";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminSettingsLoading() {
  return (
    <AppPage eyebrow="Administration" title="Settings">
      <div className="flex flex-col gap-6">
        <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
          <Skeleton className="h-7 w-24 rounded-md" />
          <Skeleton className="h-7 w-24 rounded-md" />
          <Skeleton className="h-7 w-28 rounded-md" />
        </div>
        <div className="max-w-2xl flex flex-col gap-5 pt-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    </AppPage>
  );
}
