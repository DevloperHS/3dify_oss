import { auth } from "./auth";

export type CurrentUser = {
  id: string;
  email: string;
  name: string;
};

export async function getCurrentUser(
  requestHeaders: Headers,
): Promise<CurrentUser | null> {
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session) return null;
  const { id, email, name } = session.user;
  return { id, email, name };
}
