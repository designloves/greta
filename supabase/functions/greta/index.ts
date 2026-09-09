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

  if (req.method === 'GET'    && path.endsWith('/sets'))   return getSets(req)
  if (req.method === 'GET'    && path.includes('/sets/'))  return getSet(url)
  if (req.method === 'POST'   && path.endsWith('/sets'))   return saveSet(req)
  if (req.method === 'PATCH'  && path.includes('/sets/'))  return updateSet(req, url)
  if (req.method === 'DELETE' && path.includes('/sets/'))  return deleteSet(req, url)

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
