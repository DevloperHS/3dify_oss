import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { JOB_STATUSES } from "@/jobs/state-machine";

// Better Auth core tables (shape per @better-auth/cli generate for the drizzle adapter).
// `user` is the app's User domain entity — Jobs and Assets will reference user.id.

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// Pipeline domain tables — see CONTEXT.md for Job/Asset definitions and
// spec.md "Data model". The full state list is declared up front even though
// the tracer bullet only walks queued → reconstructing → exporting →
// succeeded; Moderation/Preprocessing/Postprocessing stages activate their
// states in later tickets without a schema migration.

export const jobStatus = pgEnum("job_status", JOB_STATUSES);

export const failureCategory = pgEnum("failure_category", [
  "terminal",
  "transient",
]);

export const job = pgTable(
  "job",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: jobStatus("status").notNull().default("queued"),
    failureCategory: failureCategory("failure_category"),
    failureReason: text("failure_reason"),
    attempts: integer("attempts").notNull().default(0),
    sourceImageUrl: text("source_image_url").notNull(),
    sourceImagePublicId: text("source_image_public_id").notNull(),
    // Set by the retention sweep (ticket 09) once the Source Image is gone
    // from Cloudinary — the marker that makes the sweep idempotent.
    sourceImageDeletedAt: timestamp("source_image_deleted_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("job_user_id_idx").on(table.userId)],
);

export const asset = pgTable(
  "asset",
  {
    id: text("id").primaryKey(),
    jobId: text("job_id")
      .notNull()
      .unique()
      .references(() => job.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    r2Key: text("r2_key").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("asset_user_id_idx").on(table.userId)],
);
