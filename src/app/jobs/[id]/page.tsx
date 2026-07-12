import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { JobStatus } from "@/components/job-status";

export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser(await headers());
  if (!user) redirect("/");
  const { id } = await params;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Your 3D asset</h1>
      <JobStatus jobId={id} />
      <Link href="/" className="text-sm underline opacity-70 hover:opacity-100">
        ← Back to upload
      </Link>
    </main>
  );
}
