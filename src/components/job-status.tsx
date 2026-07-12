"use client";

import { useEffect, useState } from "react";
import { GlbViewer } from "./glb-viewer";

type JobStatusResponse = {
  id: string;
  status: string;
  failureReason: string | null;
  asset?: { id: string; url: string; sizeBytes: number };
};

const TERMINAL_STATUSES = ["succeeded", "failed"];
const POLL_INTERVAL_MS = 2500;

const STAGE_LABELS: Record<string, string> = {
  queued: "Waiting in the queue…",
  moderating: "Checking the image…",
  preprocessing: "Preparing the image…",
  reconstructing: "Reconstructing your 3D model…",
  postprocessing: "Cleaning up the mesh…",
  exporting: "Saving your asset…",
};

export function JobStatus({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<JobStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      let response: Response;
      try {
        response = await fetch(`/api/jobs/${jobId}`);
      } catch {
        // Network hiccup — keep polling.
        if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS);
        return;
      }
      if (cancelled) return;
      if (!response.ok) {
        setError(response.status === 404 ? "job not found" : "something went wrong");
        return;
      }
      const data: JobStatusResponse = await response.json();
      if (cancelled) return;
      setJob(data);
      if (!TERMINAL_STATUSES.includes(data.status)) {
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [jobId]);

  if (error) return <p className="text-red-500">{error}</p>;
  if (!job) return <p className="opacity-60">Loading…</p>;

  if (job.status === "failed") {
    return (
      <div className="flex flex-col items-center gap-2">
        <p className="text-red-500">This job failed: {job.failureReason ?? "unknown error"}</p>
        <p className="text-sm opacity-60">You can go back and try another upload.</p>
      </div>
    );
  }

  if (job.status === "succeeded" && job.asset) {
    return (
      <div className="flex w-full max-w-xl flex-col items-center gap-4">
        <p>Your 3D asset is ready.</p>
        <GlbViewer src={job.asset.url} alt="Your generated 3D asset" />
        <a
          href={job.asset.url}
          download
          className="rounded-md bg-foreground px-4 py-2 text-background hover:opacity-90"
        >
          Download GLB ({formatBytes(job.asset.sizeBytes)})
        </a>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
      <p>{STAGE_LABELS[job.status] ?? "Working…"}</p>
      <p className="text-sm opacity-60">
        This page updates automatically — no need to refresh.
      </p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
