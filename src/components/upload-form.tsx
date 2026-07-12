"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function UploadForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setSubmitting(true);
    setError(null);

    const response = await fetch("/api/jobs", { method: "POST", body: formData });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      setError(body?.error ?? "upload failed — please try again");
      setSubmitting(false);
      return;
    }
    const { id } = await response.json();
    router.push(`/jobs/${id}`);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col items-center gap-4">
      <input
        type="file"
        name="image"
        accept="image/jpeg,image/png,image/webp"
        required
        className="text-sm file:mr-4 file:rounded-md file:border-0 file:bg-foreground file:px-4 file:py-2 file:text-background hover:file:opacity-90"
      />
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-foreground px-4 py-2 text-background hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Uploading…" : "Create 3D asset"}
      </button>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </form>
  );
}
