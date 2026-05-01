"use client";

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  FileTextIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  FileUpload,
  FileUploadDropzone,
  FileUploadItem,
  FileUploadItemDelete,
  FileUploadItemMetadata,
  FileUploadItemPreview,
  FileUploadList,
  FileUploadTrigger,
} from "@/components/ui/file-upload";

export function StepUpload({
  csvFile,
  csvRows,
  csvHeaders,
  parseWarning,
  onFileAccept,
  onFileRemove,
}: {
  csvFile: File | null;
  csvRows: { length: number };
  csvHeaders: { length: number };
  parseWarning: string | null;
  onFileAccept: (files: File[]) => void;
  onFileRemove: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-base font-semibold">Upload CSV File</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Select or drag a{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">.csv</code>{" "}
          file. The first row must contain column headers. Up to 500 data rows
          are supported.
        </p>
      </div>

      {parseWarning && (
        <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
          <AlertTriangleIcon className="text-amber-600" />
          <AlertTitle>Note</AlertTitle>
          <AlertDescription className="text-amber-800 dark:text-amber-200">
            {parseWarning}
          </AlertDescription>
        </Alert>
      )}

      <FileUpload
        accept=".csv,text/csv"
        maxFiles={1}
        maxSize={10 * 1024 * 1024}
        onAccept={onFileAccept}
        onFileReject={(_file, message) => toast.error(message)}
        className="w-full"
      >
        <FileUploadDropzone className="flex min-h-48 cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border bg-muted/30 p-8 transition-colors hover:bg-muted/60 data-drag-over:border-primary data-drag-over:bg-primary/5">
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="rounded-full bg-primary/10 p-3">
              <FileTextIcon className="size-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Drop your CSV here</p>
              <p className="text-xs text-muted-foreground">
                or click to browse
              </p>
            </div>
          </div>
          <FileUploadTrigger asChild>
            <Button variant="outline" size="sm" type="button">
              <UploadIcon data-icon="inline-start" />
              Browse file
            </Button>
          </FileUploadTrigger>
        </FileUploadDropzone>

        <FileUploadList className="mt-3">
          {csvFile && (
            <FileUploadItem value={csvFile}>
              <FileUploadItemPreview />
              <FileUploadItemMetadata />
              <FileUploadItemDelete asChild>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="ml-auto"
                  type="button"
                  onClick={onFileRemove}
                >
                  <XIcon />
                </Button>
              </FileUploadItemDelete>
            </FileUploadItem>
          )}
        </FileUploadList>
      </FileUpload>

      {csvRows.length > 0 && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
          <CheckCircle2Icon className="size-4 shrink-0 text-green-600" />
          <span className="text-sm text-muted-foreground">
            Parsed{" "}
            <strong className="text-foreground">
              {csvRows.length} row{csvRows.length !== 1 ? "s" : ""}
            </strong>{" "}
            with{" "}
            <strong className="text-foreground">
              {csvHeaders.length} column{csvHeaders.length !== 1 ? "s" : ""}
            </strong>
          </span>
        </div>
      )}
    </div>
  );
}
