import { parse } from "dotenv";
import fs from "node:fs";

/**
 * QA Supabase credentials for e2e tests, from QA_* variables or .env.qa.local, never
 * the ambient environment, so a test run cannot reach prod.
 */
const qaFile = fs.existsSync(".env.qa.local") ? parse(fs.readFileSync(".env.qa.local")) : {};

export const qaEnv = {
  supabaseUrl: process.env.QA_SUPABASE_URL ?? qaFile.SUPABASE_URL ?? "",
  publishableKey: process.env.QA_SUPABASE_PUBLISHABLE_KEY ?? qaFile.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
  serviceRoleKey: process.env.QA_SUPABASE_SERVICE_ROLE_KEY ?? qaFile.SUPABASE_SERVICE_ROLE_KEY ?? "",
};

export const hasQaEnv = Boolean(qaEnv.supabaseUrl && qaEnv.publishableKey && qaEnv.serviceRoleKey);
