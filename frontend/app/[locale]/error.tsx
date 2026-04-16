"use client";

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Unhandled error:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b1120]">
      <div className="mx-4 max-w-md rounded-2xl border border-white/10 bg-white/5 p-8 text-center backdrop-blur-xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/20">
          <svg className="h-7 w-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="mb-2 text-lg font-semibold text-white">Something went wrong</h2>
        <p className="mb-6 text-sm text-white/50">
          An unexpected error occurred. Your data is safe — try again or refresh the page.
        </p>
        <div className="flex justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-xl bg-white/10 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/20"
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            className="rounded-xl border border-white/10 px-5 py-2.5 text-sm font-medium text-white/60 transition-colors hover:bg-white/5"
          >
            Refresh page
          </button>
        </div>
      </div>
    </div>
  );
}
