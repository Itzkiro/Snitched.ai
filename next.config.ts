import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Include the pro-Israel donor registry CSVs in the serverless bundle so
  // the roster-match cron route can read them at runtime. Without this,
  // Next.js only bundles files traced as JS imports — our CSVs are read via
  // fs.readFileSync at runtime and would otherwise return ENOENT on Vercel.
  outputFileTracingIncludes: {
    '/api/cron/refresh-gallrein-roster': ['./data/pro-israel-donors-*.csv'],
  },
};

export default nextConfig;
