import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import type { JobStatus } from "@/jobs/state-machine";
import { listAssets, listJobHistory } from "@/library/queries";
import { getCurrentUser } from "@/lib/session";
import { assetStorage } from "@/storage/assets";

// The Asset & Job library (ticket 08): full Job history — failures with
// their reasons included — plus the permanent Asset library. Server-rendered
// straight from the user-scoped queries; viewing an Asset in 3D goes through
// the Job page, which already carries the ticket 02 viewer.

const STATUS_LABELS: Record<JobStatus, string> = {
  queued: "Queued",
  moderating: "Checking image",
  preprocessing: "Preparing image",
  reconstructing: "Reconstructing",
  postprocessing: "Cleaning up mesh",
  exporting: "Saving asset",
  succeeded: "Succeeded",
  failed: "Failed",
};

export default async function LibraryPage() {
  const user = await getCurrentUser(await headers());
  if (!user) redirect("/");

  const [history, assets] = await Promise.all([
    listJobHistory(db, user.id),
    listAssets(db, user.id),
  ]);
  const downloadUrls = new Map(
    await Promise.all(
      assets.map(
        async (entry) =>
          [entry.id, await assetStorage.downloadUrl(entry.storageKey)] as const,
      ),
    ),
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-10 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your library</h1>
        <Link href="/" className="text-sm underline opacity-70 hover:opacity-100">
          ← Back to upload
        </Link>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Assets</h2>
        {assets.length === 0 && (
          <p className="text-sm opacity-60">
            No assets yet — successful jobs land here permanently.
          </p>
        )}
        <ul className="flex flex-col gap-2">
          {assets.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between rounded-md border border-foreground/15 px-4 py-3"
            >
              <div className="flex flex-col">
                <span className="font-medium">3D asset</span>
                <span className="text-xs opacity-60">
                  {entry.createdAt.toLocaleString()} · {formatBytes(entry.sizeBytes)}
                </span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Link href={`/jobs/${entry.jobId}`} className="underline">
                  View in 3D
                </Link>
                <a href={downloadUrls.get(entry.id)} download className="underline">
                  Download
                </a>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Job history</h2>
        {history.length === 0 && (
          <p className="text-sm opacity-60">No jobs yet — upload a photo to start.</p>
        )}
        <ul className="flex flex-col gap-2">
          {history.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center justify-between rounded-md border border-foreground/15 px-4 py-3"
            >
              <div className="flex flex-col">
                <span className="font-medium">{STATUS_LABELS[entry.status]}</span>
                <span className="text-xs opacity-60">
                  {entry.createdAt.toLocaleString()}
                </span>
                {entry.status === "failed" && (
                  <span className="text-sm text-red-500">
                    {entry.failureReason ?? "unknown error"}
                  </span>
                )}
              </div>
              <div className="text-sm">
                {entry.status === "succeeded" && entry.assetId ? (
                  <Link href={`/jobs/${entry.id}`} className="underline">
                    View asset
                  </Link>
                ) : entry.status !== "failed" ? (
                  <Link href={`/jobs/${entry.id}`} className="underline">
                    Watch progress
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
