# Greta – Setup Guide

## What you need
- Your Supabase project
- Your Anthropic API key (console.anthropic.com)
- Supabase CLI: `npm install -g supabase`

---

## Step 1 – Create the database table

1. Supabase dashboard → **SQL Editor** → **New query**
2. Paste the contents of `schema.sql` and click **Run**

---

## Step 2 – Deploy the Edge Function

```bash
# Login and link to your project
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# Deploy
mkdir -p supabase/functions/greta
cp index.ts supabase/functions/greta/index.ts
supabase functions deploy greta
```

---

## Step 3 – Set secrets

```bash
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set OWNER_PASSWORD=your-chosen-password
```

---

## Step 4 – Configure greta.html

Open `greta.html` and set the one config line:

```js
const API = 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/greta';
```

---

## Step 5 – Host greta.html

- **GitHub Pages** — push to a repo, enable Pages in settings
- **Anywhere** — it's a single file, works even opened locally

Share the URL with students. No login needed to play.

---

## How sharing works

Each word list gets a unique ID in Supabase.
Click the 🔗 button next to any list to copy a share link like:

```
https://yoursite.com/greta.html?set=abc-123-def
```

Anyone opening that link goes straight into that word list.

---

## Security summary

| What | Where | Visible to |
|---|---|---|
| Anthropic API key | Supabase secrets | Nobody |
| Owner password | Supabase secrets | Nobody |
| Password in browser | Memory only, never stored | Nobody |
| API URL | greta.html | Everyone — harmless without password |
| Word sets | Supabase DB (public read) | Everyone — intentional |
