import { createDb } from "./client";

export const db = createDb(process.env.DATABASE_URL!);
