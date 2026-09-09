// ═══════════════════════════════════════════════════════
//  Greta – Supabase Edge Function
//  supabase/functions/greta/index.ts
//
//  Auto-provided secrets (no manual setup needed):
//    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
// ═══════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const MAX_WORDS = 20

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
function err(msg: string, status: number) { return json({ error: msg }, status) }

// Service-role client — bypasses RLS, used for all DB writes and share-link reads
function db() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

// Verify the Bearer JWT and return the Supabase user (or null)
async function getUser(req: Request) {
  const auth = req.headers.get('Authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  const { data: { user }, error } = await createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  ).auth.getUser(token)
  if (error || !user) return null
  return user
}

// ── Router ───────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const url  = new URL(req.url)
  const path = url.pathname

  if (req.method === 'GET'    && path.endsWith('/sets'))      return getSets(req)
  if (req.method === 'GET'    && path.includes('/sets/'))     return getSet(url)
  if (req.method === 'POST'   && path.endsWith('/sets'))      return saveSet(req)
  if (req.method === 'PATCH'  && path.includes('/sets/'))     return updateSet(req, url)
  if (req.method === 'DELETE' && path.includes('/sets/'))     return deleteSet(req, url)
  if (req.method === 'POST'   && path.endsWith('/translate')) return translateWords(req)

  return err('Not found', 404)
})

// ── GET /sets — auth required, returns the current user's sets ──

async function getSets(req: Request) {
  const user = await getUser(req)
  if (!user) return err('Unauthorized', 401)

  const { data, error } = await db()
    .from('word_sets')
    .select('id, topic, vocab, lang_from, lang_to, word_count, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return err(error.message, 500)
  return json(data ?? [])
}

// ── GET /sets/:id — public, load one set by ID (for share links) ──

async function getSet(url: URL) {
  const id = url.pathname.split('/').pop()
  if (!id) return err('Missing ID', 400)

  const { data, error } = await db()
    .from('word_sets')
    .select('id, topic, vocab, lang_from, lang_to, created_at')
    .eq('id', id)
    .maybeSingle()

  if (error) return err(error.message, 500)
  if (!data)  return err('Set not found', 404)
  return json(data)
}

// ── POST /sets — auth required, save a new set ──────────

async function saveSet(req: Request) {
  const user = await getUser(req)
  if (!user) return err('Unauthorized', 401)

  let body: { topic?: string; vocab?: unknown[]; lang_from?: string; lang_to?: string }
  try { body = await req.json() }
  catch { return err('Invalid JSON', 400) }

  const { topic, vocab, lang_from, lang_to } = body
  if (!topic || !vocab?.length) return err('Missing topic or vocab', 400)
  if (vocab.length > MAX_WORDS) return err(`Max ${MAX_WORDS} words`, 400)

  const { data, error } = await db()
    .from('word_sets')
    .insert({
      topic, vocab, word_count: vocab.length, user_id: user.id,
      lang_from: lang_from || 'sv', lang_to: lang_to || 'en',
    })
    .select('id')
    .single()

  if (error) return err(error.message, 500)
  return json({ id: data.id })
}

// ── PATCH /sets/:id — auth required, update an existing set ──

async function updateSet(req: Request, url: URL) {
  const user = await getUser(req)
  if (!user) return err('Unauthorized', 401)

  const id = url.pathname.split('/').pop()
  if (!id) return err('Missing ID', 400)

  let body: { topic?: string; vocab?: unknown[]; lang_from?: string; lang_to?: string }
  try { body = await req.json() }
  catch { return err('Invalid JSON', 400) }

  const { topic, vocab, lang_from, lang_to } = body
  if (!topic || !vocab?.length) return err('Missing topic or vocab', 400)
  if (vocab.length > MAX_WORDS) return err(`Max ${MAX_WORDS} words`, 400)

  const { data, error } = await db()
    .from('word_sets')
    .update({
      topic, vocab, word_count: vocab.length,
      lang_from: lang_from || 'sv', lang_to: lang_to || 'en',
    })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle()

  if (error) return err(error.message, 500)
  if (!data) return err('Set not found', 404)
  return json({ id: data.id })
}

// ── POST /translate — no auth required, translate a word list ──
// Requires an ANTHROPIC_API_KEY secret (supabase secrets set ANTHROPIC_API_KEY=sk-ant-...)

const LANG_NAMES: Record<string, string> = {
  sv: 'Swedish', en: 'English', es: 'Spanish', fr: 'French', de: 'German',
}

async function translateWords(req: Request) {
  let body: { words?: unknown[]; from?: string; to?: string }
  try { body = await req.json() }
  catch { return err('Invalid JSON', 400) }

  const words = (body.words ?? [])
    .map((w) => String(w).trim())
    .filter(Boolean)
    .slice(0, MAX_WORDS)
  if (!words.length) return err('No words provided', 400)

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
  if (!apiKey) return err('Translation is not configured on this server', 503)

  const fromName = body.from && LANG_NAMES[body.from] ? LANG_NAMES[body.from] : null
  const toName   = body.to   && LANG_NAMES[body.to]   ? LANG_NAMES[body.to]   : null

  const instructions = fromName && toName
    ? `The words below are in ${fromName}. Translate each one to ${toName}.`
    : toName
    ? `Detect the language the words below are written in, then translate each one to ${toName}.`
    : `Detect the language the words below are written in. If it is English, translate each word to Swedish. Otherwise, translate each word to English.`

  const prompt = `${instructions}

Return ONLY a JSON object with this exact shape and nothing else — no markdown, no explanation:
{"from":"<source language code>","to":"<target language code>","translations":["<translation 1>","<translation 2>"]}

Language codes must be one of: sv, en, es, fr, de.
The "translations" array must have exactly ${words.length} items, in the same order as the words below, each a single word or short phrase (not a full sentence).

Words:
${words.map((w, i) => `${i + 1}. ${w}`).join('\n')}`

  let res: Response
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    })
  } catch {
    return err('Could not reach translation service', 502)
  }
  if (!res.ok) return err('Translation service error', 502)

  const data = await res.json()
  const text: string = data?.content?.[0]?.text ?? ''
  let parsed: { from?: string; to?: string; translations?: unknown[] }
  try {
    const match = text.match(/\{[\s\S]*\}/)
    parsed = JSON.parse(match ? match[0] : text)
  } catch {
    return err('Could not parse translation response', 502)
  }

  if (!Array.isArray(parsed.translations) || parsed.translations.length !== words.length) {
    return err('Translation response did not match the word count', 502)
  }
  const from = parsed.from && LANG_NAMES[parsed.from] ? parsed.from : (body.from || 'en')
  const to   = parsed.to   && LANG_NAMES[parsed.to]   ? parsed.to   : (body.to   || 'sv')
  return json({ from, to, translations: parsed.translations.map((t) => String(t)) })
}

// ── DELETE /sets/:id — auth required, only own sets ─────

async function deleteSet(req: Request, url: URL) {
  const user = await getUser(req)
  if (!user) return err('Unauthorized', 401)

  const id = url.pathname.split('/').pop()
  if (!id) return err('Missing ID', 400)

  const { error } = await db()
    .from('word_sets')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return err(error.message, 500)
  return json({ deleted: id })
}
