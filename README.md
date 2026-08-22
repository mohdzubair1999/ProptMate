# ProptMate

The smarter property companion — inspections, reporting, and maintenance workflows.

Stack: Next.js 14 (App Router) · TailwindCSS · Prisma · PostgreSQL · NextAuth · Vercel Blob · Claude/OpenAI

## What's built

- Auth (email/password + Google), multi-tenant companies, roles (Admin/Manager/Inspector/Client)
- Properties, freeform inspections (rooms/items/photos), PDF report generation
- **Template engine**: build custom inspection forms (Settings → Report templates) with 15 field types
  including Signature, Inventory sections, Grid comparisons, and more
- **AI features**: per-field text polish, whole-report AI summary, and AI photo analysis for
  maintenance issues — all powered by Claude and/or OpenAI, your choice per-click
- **Voice dictation** on every notes field (Chrome/Edge/Safari)
- 33+ pre-built report templates covering HMO compliance, Awaab's Law, HHSRS, Legionella,
  check-in/check-out, and full furnished/unfurnished inventory series — see `scripts/`

## Run it locally (MacBook)

1. **Node.js**: nodejs.org, get the LTS version.
2. **Database**: free Postgres from [supabase.com](https://supabase.com) or [neon.tech](https://neon.tech).
3. Install dependencies:
   ```
   cd proptmate
   npm install
   ```
4. Set up your environment:
   ```
   cp .env.example .env
   ```
   Fill in `DATABASE_URL` and `DIRECT_URL` from your database provider. Generate `BETTER_AUTH_SECRET` with:
   ```
   openssl rand -base64 32
   ```
5. **Photo storage**: Vercel dashboard → Storage → Create Database → Blob → **choose Public access** → copy the token into `BLOB_READ_WRITE_TOKEN`.
6. **AI features** (optional): add `ANTHROPIC_API_KEY` and/or `OPENAI_API_KEY`.
7. Push the schema:
   ```
   npx prisma db push
   ```
8. Run it:
   ```
   npm run dev
   ```

## Loading the pre-built templates

Each file in `scripts/` seeds one report template into your database. Find your company ID first:

```
node --env-file=.env scripts/list-companies.js
```

Then run any script with that ID:

```
node --env-file=.env scripts/seed-room-template.js YOUR_COMPANY_ID
```

The Inventory and Mid-Term series are parameterized — pass a variant key as a second argument:

```
node --env-file=.env scripts/seed-inventory-template.js YOUR_COMPANY_ID 2bed-house
node --env-file=.env scripts/seed-midterm-template.js YOUR_COMPANY_ID 3bed-apartment
```

Run either with no key argument to see the full list of available variants.

## Deploy to Vercel

1. Push this repo to GitHub, then Vercel → New Project → Import it.
2. Add all the same environment variables from your `.env` in Vercel's project settings
   (set `BETTER_AUTH_URL` and `NEXT_PUBLIC_APP_URL` to your live domain).
3. Deploy.

## What's next (roadmap)

- Real cross-report comparison (check-in vs check-out Grid Sections currently display-only)
- Merge-field auto-fill (e.g. property address auto-populating into templates)
- Manager/Client role-specific views and permissions
- Tenant/landlord self-service portal access (schema supports it, portal UI doesn't exist yet)
- Billing (Stripe)
