import { headers } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { SignInButton, SignOutButton } from "@/components/auth-buttons";
import { UploadForm } from "@/components/upload-form";

export default async function Home() {
  const user = await getCurrentUser(await headers());

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6">
      <h1 className="text-3xl font-semibold">Maker</h1>
      <p className="opacity-70">Turn a photo of an object into a 3D asset.</p>
      {user ? (
        <div className="flex flex-col items-center gap-6">
          <UploadForm />
          <div className="flex items-center gap-3 text-sm opacity-70">
            <span>
              Signed in as <span className="font-medium">{user.name}</span>
            </span>
            <SignOutButton />
          </div>
        </div>
      ) : (
        <SignInButton />
      )}
    </main>
  );
}
