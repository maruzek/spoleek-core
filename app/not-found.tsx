import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#f8f7f3_0%,#f4efe4_100%)] px-6">
      <div className="max-w-lg rounded-4xl border border-slate-950/10 bg-white p-10 text-center shadow-[0_24px_80px_-32px_rgba(15,23,42,0.35)]">
        <p className="text-xs font-semibold tracking-[0.28em] uppercase text-slate-500">
          Not found
        </p>
        <h1 className="mt-4 text-4xl font-semibold text-slate-950">
          That page does not exist.
        </h1>
        <p className="mt-4 text-sm leading-7 text-slate-600">
          The route may have moved while the product foundation is still taking shape.
        </p>
        <div className="mt-8 flex justify-center">
          <Button asChild>
            <Link href="/">Return home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
