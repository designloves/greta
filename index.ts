// ═══════════════════════════════════════════════════════
//  Greta – Supabase Edge Function
//  supabase/functions/greta/index.ts
//
//  Secrets (supabase secrets set KEY=value):
//    ANTHROPIC_API_KEY
//    OWNER_PASSWORD
// ═══════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Password',
}

const MAX_WORDS      = 20
const MAX_TEXT_CHARS = 4000  // ~a full page of text

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
function err(msg: string, status: number) { return json({ error: msg }, status) }

function db() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
}

function authed(req: Request) {
  return (req.headers.get('X-Password') ?? '') === Deno.env.get('OWNER_PASSWORD')
}

// ── Router ───────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const url = new URL(req.url)
  const path = url.pathname

  if (req.method === 'GET'    && path.endsWith('/sets'))     return getSets()
  if (req.method === 'GET'    && path.includes('/sets/'))    return getSet(url)
  if (req.method === 'POST'   && path.endsWith('/sets'))     return saveSet(req)
  if (req.method === 'DELETE' && path.includes('/sets/'))    return deleteSet(req, url)

  return err('Not found', 404)
})

// ── GET /sets — public, list all sets ───────────────────

async function getSets() {
  const { data, error } = await db()
    .from('word_sets')
    .select('id, topic, word_count, created_at')
    .order('created_at', { ascending: false })

  if (error) return err(error.message, 500)
  return json(data ?? [])
}

// ── GET /sets/:id — public, load one set ────────────────

async function getSet(url: URL) {
  const id = url.pathname.split('/').pop()
  if (!id) return err('Missing ID', 400)

  const { data, error } = await db()
    .from('word_sets')
    .select('id, topic, vocab, created_at')
    .eq('id', id)
    .maybeSingle()

  if (error) return err(error.message, 500)
  if (!data)  return err('Set not found', 404)
  return json(data)
}

// ── POST /sets — owner only, save a set ─────────────────

async function saveSet(req: Request) {
  if (!authed(req)) return err('Wrong password 💦', 401)

  let body: { topic?: string; vocab?: unknown[] }
  try { body = await req.json() }
  catch { return err('Invalid JSON', 400) }

  const { topic, vocab } = body
  if (!topic || !vocab?.length) return err('Missing topic or vocab', 400)

  const { data, error } = await db()
    .from('word_sets')
    .insert({ topic, vocab, word_count: vocab.length })
    .select('id')
    .single()

  if (error) return err(error.message, 500)
  return json({ id: data.id })
}

// ── DELETE /sets/:id — owner only ───────────────────────

async function deleteSet(req: Request, url: URL) {
  if (!authed(req)) return err('Wrong password 💦', 401)

  const id = url.pathname.split('/').pop()
  if (!id) return err('Missing ID', 400)

  const { error } = await db().from('word_sets').delete().eq('id', id)
  if (error) return err(error.message, 500)
  return json({ deleted: id })
}
