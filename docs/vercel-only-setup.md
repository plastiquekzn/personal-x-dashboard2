# Vercel-Only Setup Guide

This guide explains how to deploy `Personal X Dashboard` without installing Node.js, Git, or the project code on your computer.

You only need:

- a `GitHub` account
- a `Vercel` account
- a `Supabase` account
- a `Gemini API key`

## 1. Copy The GitHub Repository

Use one of these options:

1. Open the repository on GitHub
2. Click `Fork` to create your own copy

Or:

1. Click `Use this template` if the repository is configured as a template
2. Create a new repository under your own GitHub account

Repository:

[https://github.com/plastiquekzn/personal-x-dashboard2](https://github.com/plastiquekzn/personal-x-dashboard2)

## 2. Create Supabase Project

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Click `New project`
3. Choose an organization
4. Enter a project name
5. Set a database password
6. Pick a region close to you
7. Wait for the project to finish creating

Save these values from `Project Settings` -> `API`:

- `Project URL`
- `anon` or `publishable` key
- `service_role` key

## 3. Run Database Schema

1. In Supabase, open `SQL Editor`
2. Click `New query`
3. Open this file on GitHub:

[supabase/schema.sql](../supabase/schema.sql)

4. Copy the full SQL file
5. Paste it into Supabase SQL Editor
6. Click `Run`

If Supabase asks about RLS, choose `Run and enable RLS`.

## 4. Create Storage Bucket

1. In Supabase, open `Storage`
2. Click `New bucket`
3. Name it:

```text
tweet-screenshots
```

4. Keep it `private`
5. Create the bucket

## 5. Create Gemini API Key

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Open `API keys`
3. Create a new API key
4. Save it somewhere safe

## 6. Import Project Into Vercel

1. Go to [Vercel](https://vercel.com/)
2. Click `Add New` -> `Project`
3. Select your GitHub copy of this repository
4. Keep the framework preset as `Next.js`
5. Open `Environment Variables`

Add these variables:

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

Use a long unique password for `APP_BASIC_AUTH_PASSWORD`. Do not reuse your GitHub, Vercel, Google, or Supabase password.

For each variable, select `Production and Preview`.

Click `Deploy`.

## 7. Open The App

After Vercel finishes deploying:

1. Open the Vercel deployment URL
2. Enter your `APP_BASIC_AUTH_USERNAME`
3. Enter your `APP_BASIC_AUTH_PASSWORD`

If the login does not work:

1. Check both Basic Auth variables in Vercel
2. Save them again
3. Open `Deployments`
4. Click `...` on the latest deployment
5. Click `Redeploy`
6. Open the site in an incognito/private browser window

## 8. First App Setup

Inside the app:

1. Open `Projects`
2. Create your first project
3. Go back to `Posts`
4. Use `Add Post` to save a tweet URL
5. Use `Add Post (Detailed)` for screenshot-based extraction

## Updating Later

If the original repository gets updates:

1. Sync or update your GitHub copy
2. Push the updated `main` branch
3. Vercel will deploy the new version automatically

You do not need to install anything locally for normal Vercel usage.
