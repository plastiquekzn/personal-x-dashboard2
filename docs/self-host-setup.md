# Self-Host Setup Guide

This guide is for anyone who wants to run their own copy of `Personal X Dashboard`.

You do **not** need access to the original owner's database or API keys.

You will create your own:

- `GitHub` repository copy
- `Supabase` project
- `Gemini API key`
- `Vercel` deployment

## Requirements

Install these first:

- `Node.js` 24.x: [nodejs.org](https://nodejs.org/)
- `Git`: [git-scm.com/downloads](https://git-scm.com/downloads)
- a code editor, for example `VS Code`

Check that Node and Git are available:

```bash
node --version
npm --version
git --version
```

## 1. Get The Code

You need your own copy of the repo.

Options:

1. Fork the repository on GitHub
2. Or download the code and create a new GitHub repository from it

If you use GitHub with Vercel, deployment becomes much easier.

GitHub docs:

- [Add an existing project to GitHub](https://docs.github.com/en/get-started/importing-your-projects-to-github/importing-source-code-to-github)

If you are using this repository directly, clone it:

```bash
git clone https://github.com/plastiquekzn/personal-x-dashboard2.git
cd personal-x-dashboard2
```

If you downloaded a ZIP instead:

1. unzip the project
2. open the unzipped folder in your terminal
3. continue with the steps below

## 2. Create Supabase

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Create a new project
3. Wait until it finishes provisioning

Then collect these values:

- `Project URL`
- `anon` or `publishable` key
- `service_role` key

## 3. Run The SQL Schema

1. Open `SQL Editor` in Supabase
2. Create a new query
3. Copy everything from:

[supabase/schema.sql](../supabase/schema.sql)

4. Paste it into Supabase
5. Click `Run`

If Supabase asks about `RLS`, use:

- `Run and enable RLS`

## 4. Create The Storage Bucket

1. Open `Storage` in Supabase
2. Create a bucket named:

`tweet-screenshots`

3. Make it `private`

This bucket stores:

- post screenshots
- project logos

## 5. Create Gemini API Key

1. Open [Google AI Studio](https://aistudio.google.com/)
2. Create an API key
3. Save it somewhere safe

Note:

- free tier limits can be small
- if Gemini is overloaded, some extractions may need a retry

Docs:

- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [Gemini API rate limits](https://ai.google.dev/gemini-api/docs/rate-limits)

## 6. Configure Environment Variables

Copy:

`.env.example` -> `.env.local`

On macOS/Linux:

```bash
cp .env.example .env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Fill in:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
NEXT_PUBLIC_SUPABASE_BUCKET=tweet-screenshots
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash-lite
APP_BASIC_AUTH_USERNAME=your_login
APP_BASIC_AUTH_PASSWORD=your_strong_password
```

Important:

- never commit `.env.local`
- never share `SUPABASE_SERVICE_ROLE_KEY`
- set `APP_BASIC_AUTH_USERNAME` and `APP_BASIC_AUTH_PASSWORD` before deploying if the app should be private

## 7. Run Locally

Install dependencies:

```bash
npm install
```

Start development server:

```bash
npm run dev
```

Open:

[http://localhost:3000](http://localhost:3000)

## 8. First App Setup

After opening the app:

1. Go to `Projects`
2. Create at least one project
3. Return to `Posts`
4. Use `Add Post` for fast URL capture
5. Use `Add Post (Detailed)` if you want screenshot-based capture

## 9. Deploy To Vercel

1. Push the repo to GitHub
2. Go to [Vercel](https://vercel.com/)
3. Click `Add New` -> `Project`
4. Import the GitHub repo
5. Keep the framework preset as `Next.js`
6. Open `Environment Variables`
7. Add every value from `.env.local`
8. Make sure these two variables are set:

```env
APP_BASIC_AUTH_USERNAME=your_login
APP_BASIC_AUTH_PASSWORD=your_strong_password
```

9. Click `Deploy`
10. Open the deployment URL and enter your Basic Auth login and password

After the first deploy, every push to the `main` branch creates a new Vercel deployment automatically.

Vercel docs:

- [Deploying Next.js on Vercel](https://vercel.com/docs/frameworks/nextjs)

## 10. Keep The App Private

This app includes Basic Auth middleware. When `APP_BASIC_AUTH_USERNAME` and `APP_BASIC_AUTH_PASSWORD` are set, every app page and API route requires that login.

Use a long unique password. Do not reuse your GitHub, Vercel, Google, or Supabase password.

Vercel also has Deployment Protection settings, but the free Hobby plan only protects preview and generated deployment URLs. Production domains are public on Hobby, so app-level Basic Auth is the recommended private-access option for this project.

## 11. Safe Usage Model

This version is meant to be used as:

- `one deployment`
- `one owner`
- `one Supabase project`

Best practice:

- each person runs their own instance
- each person uses their own API keys
- each person uses their own storage and database

This is the safest way to use the current version.

## Troubleshooting

### Supabase warning about missing column

If the app complains about missing columns like `reposts_count` or `logo_path`, it usually means the schema was not applied correctly.

Run the full schema again from:

[supabase/schema.sql](../supabase/schema.sql)

### Gemini 429 or quota errors

This means the free tier is temporarily exhausted.

You can:

- wait for quota reset
- retry later
- use a paid Gemini plan

### Gemini 503 high demand

This is temporary model overload on Google's side.

Retry after a short wait.

### Posts page opens but saving fails

Check:

- Supabase env vars
- storage bucket name
- `service_role` key
- schema was actually applied

## What To Send To Another Person

If you are sharing this project with someone else, send them:

1. the GitHub repository link
2. this file:

[docs/self-host-setup.md](self-host-setup.md)

3. a short note like:

`Create your own Supabase, Gemini key, and Vercel project. Do not use mine.`
