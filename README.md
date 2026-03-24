This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Supabase schema

SQL migrations live in `supabase/migrations/`. Apply them in the Supabase SQL editor or with the [Supabase CLI](https://supabase.com/docs/guides/cli) (`supabase db push`). For example, `candidate_profiles` includes `summary` and `industries` (both `text`) as expected by the app.

## Google Analytics (GA4)

- **Measurement ID:** set `NEXT_PUBLIC_GA_MEASUREMENT_ID` to your GA4 ID (format `G-XXXXXXXXXX`) in `.env.local`, Vercel project env, or your host’s env UI. The app validates the prefix `G-`.
- **Production:** when `NODE_ENV=production` and the ID is valid, the root layout loads GA via [`@next/third-parties/google`](https://nextjs.org/docs/app/building-your-application/optimizing/third-party-libraries#google-analytics) (`components/analytics/FichurGoogleAnalytics.tsx`).
- **Local development:** GA scripts are **not** loaded by default. To test locally, set `NEXT_PUBLIC_GA_ENABLE_DEV=true` alongside `NEXT_PUBLIC_GA_MEASUREMENT_ID`.
- **Custom events:** use the helpers in `lib/analytics/ga.ts` from Client Components (e.g. `trackCvUploaded()`, `trackJobViewed({ job_id })`). They call `gtag` only if it exists and never log errors in production.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
