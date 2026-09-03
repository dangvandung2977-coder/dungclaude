import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(
  fs.readFileSync("D:/QUAN TRỌNG/project/web/.env", "utf8").split("\n")
    .filter((l) => l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const { error } = await sb.from("users").update({ role: "admin" }).eq("email", "crawl_owner@test.local");
console.log(error ? `FAIL ${error.message}` : "promoted crawl_owner");
