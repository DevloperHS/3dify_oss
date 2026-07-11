// Point the app's real db/auth wiring at the test database before any module imports it.
if (!process.env.TEST_DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL is not set — is .env present and docker compose up?");
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
