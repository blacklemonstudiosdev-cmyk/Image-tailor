// Vercel serverless function — /api/generate   (put at <repo>/api/generate.js)
//
// GET  ?prompt=...&width=&height=&seed=   -> text-to-image (Pollinations), returns image bytes
// POST { prompt, image, width, height }   -> image edit; tries several base64 methods,
//                                            returns the first that yields a real image
// 400 = empty/blocked prompt   502 = upstream failed (reason explains what happened)
//
// Endpoints/models are overridable with Vercel env vars (no code change needed):
//   POLLINATIONS_EDIT_URL, POLLINATIONS_CHAT_URL, POLLINATIONS_EDIT_MODEL

export const config = { maxDuration: 60 };

const GEN_ENDPOINT  = 'https://image.pollinations.ai/prompt/';
const EDIT_ENDPOINT = process.env.POLLINATIONS_EDIT_URL  || 'https://gen.pollinations.ai/v1/images/edits';
const CHAT_ENDPOINT = process.env.POLLINATIONS_CHAT_URL  || 'https://text.pollinations.ai/openai';
const EDIT_MODEL    = process.env.POLLINATIONS_EDIT_MODEL || 'gptimage';

const ALWAYS_BLOCK = [
  'loli', 'lolicon', 'shota', 'shotacon', 'csam',
  'child porn', 'childporn', 'child pornography', 'child sex', 'child abuse',
  'pedophile', 'pedophilia', 'paedophile', 'paedophilia',
  'rape', 'raping', 'rapist', 'molest', 'molesting', 'molestation',
  'incest', 'non-consensual', 'nonconsensual', 'noncon',
  'bestiality', 'zoophilia', 'necrophilia', 'snuff'
];
const MINOR = [
  'child', 'children', 'kid', 'kids', 'toddler', 'toddlers', 'infant', 'infants',
  'baby', 'babies', 'preteen', 'pre-teen', 'preadolescent',
  'teen', 'teens', 'teenage', 'teenaged', 'teenager', 'teenagers',
  'underage', 'minor', 'minors', 'schoolgirl', 'schoolboy', 'schoolgirls', 'schoolboys',
  'little girl', 'little boy', 'little girls', 'little boys',
  'young girl', 'young boy', 'young girls', 'young boys',
  'kindergarten', 'kindergartener', 'preschool', 'preschooler', 'newborn', 'grade schooler'
];
const SEXUAL = [
  'nude', 'nudity', 'naked', 'nsfw', 'porn', 'porno', 'pornographic', 'pornography',
  'sex', 'sexual', 'sexually', 'sexy', 'erotic', 'erotica', 'explicit', 'xxx',
  'genital', 'genitals', 'genitalia', 'penis', 'vagina', 'vulva',
  'breast', 'breasts', 'boob', 'boobs', 'nipple', 'nipples', 'topless', 'cleavage',
  'lingerie', 'underwear', 'panties', 'thong', 'bikini', 'swimsuit',
  'seductive', 'provocative', 'fetish', 'bdsm', 'orgasm', 'masturbate', 'masturbation',
  'intercourse', 'fellatio', 'blowjob', 'cumshot', 'hentai', 'fondle', 'aroused'
];
const AGE_RE = /\b(?:[0-9]|1[0-7])\s*(?:y\/?o|years?[\s-]*old|yrs?[\s-]*old)\b/;

function hasTerm(text, term){
  if (/[^a-z0-9]/.test(term)) return text.indexOf(term) >= 0;
  return new RegExp('\\b' + term + '\\b').test(text);
}
export function isBlocked(prompt){
  const t = String(prompt || '').toLowerCase();
  if (ALWAYS_BLOCK.some(w => hasTerm(t, w))) return true;
  const minor = MINOR.some(w => hasTerm(t, w)) || AGE_RE.test(t);
  const sexual = SEXUAL.some(w => hasTerm(t, w));
  return minor && sexual;
}

function clampInt(v, lo, hi, dflt){
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, n));
}
function round8(n){ return Math.max(64, Math.round(n / 8) * 8); }
function stripB64(s){ const m = /^data:[^;]+;base64,(.*)$/.exec(s); return m ? m[1] : s; }

async function fromUrlOrB64(u){
  if (typeof u !== 'string') return null;
  if (u.indexOf('data:') === 0) return { buf: Buffer.from(stripB64(u), 'base64'), ct: 'image/png' };
  if (/^https?:\/\//.test(u)){
    const ir = await fetch(u);
    if (ir.ok) return { buf: Buffer.from(await ir.arrayBuffer()), ct: ir.headers.get('content-type') || 'image/png' };
  }
  return null;
}

async function extractImage(r){
  const ct = (r.headers.get('content-type') || '').toLowerCase();
  if (ct.indexOf('image/') === 0) return { buf: Buffer.from(await r.arrayBuffer()), ct };
  if (ct.indexOf('application/json') >= 0){
    const j = await r.json();
    const item = (j && j.data && j.data[0]) || null;
    if (item && item.b64_json) return { buf: Buffer.from(item.b64_json, 'base64'), ct: 'image/png' };
    if (item && item.url){ const g = await fromUrlOrB64(item.url); if (g) return g; }
    if (j && j.images && j.images[0]){ const g = await fromUrlOrB64(String(j.images[0])); if (g) return g; }
    if (j && typeof j.image === 'string'){ const g = await fromUrlOrB64(j.image); if (g) return g; }
    const msg = j && j.choices && j.choices[0] && j.choices[0].message;
    if (msg){
      if (msg.images && msg.images[0]){ const g = await fromUrlOrB64(msg.images[0].url || msg.images[0]); if (g) return g; }
      const c = msg.content;
      const text = typeof c === 'string' ? c
        : (Array.isArray(c) ? c.map(x => (x && (x.text || (x.image_url && x.image_url.url) || '')) || '').join(' ') : '');
      const m = /(data:image\/[^\s")]+|https?:\/\/[^\s")]+?\.(?:png|jpe?g|webp)[^\s")]*)/i.exec(text);
      if (m){ const g = await fromUrlOrB64(m[1]); if (g) return g; }
    }
    throw new Error('json-no-image');
  }
  throw new Error('non-image(' + (ct || 'unknown') + ')');
}

function editStrategies(prompt, image, width, height){
  return [
    async () => {
      const r = await fetch(CHAT_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: EDIT_MODEL,
          messages: [{ role: 'user', content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: image } }
          ] }]
        })
      });
      if (!r.ok) throw new Error('chat:' + r.status);
      return await extractImage(r);
    },
    async () => {
      const r = await fetch(EDIT_ENDPOINT, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, image, model: 'flux', size: width + 'x' + height })
      });
      if (!r.ok) throw new Error('edits:' + r.status);
      return await extractImage(r);
    }
  ];
}

export default async function handler(req, res){
  try {
    const method = (req.method || 'GET').toUpperCase();
    let prompt, width, height, seed, image = '';
    if (method === 'POST'){
      let b = req.body;
      if (typeof b === 'string'){ try { b = JSON.parse(b); } catch (e){ b = {}; } }
      if (!b || typeof b !== 'object') b = {};
      prompt = String(b.prompt || '').slice(0, 800).trim();
      width = round8(clampInt(b.width, 64, 2048, 1024));
      height = round8(clampInt(b.height, 64, 2048, 1024));
      image = typeof b.image === 'string' ? b.image : '';
    } else {
      const q = (req && req.query) || {};
      prompt = String(q.prompt || '').slice(0, 800).trim();
      width = round8(clampInt(q.width, 64, 2048, 1024));
      height = round8(clampInt(q.height, 64, 2048, 1024));
      seed = clampInt(q.seed, 0, 999999999, Math.floor(Math.random() * 1e9));
    }

    if (!prompt){ res.status(400).json({ error: 'empty', reason: 'Enter a prompt.' }); return; }
    if (isBlocked(prompt)){ res.status(400).json({ error: 'blocked', reason: 'That prompt isn\u2019t allowed.' }); return; }

    if (image){
      const strategies = editStrategies(prompt, image, width, height);
      const errs = [];
      for (const run of strategies){
        try {
          const out = await run();
          if (out && out.buf && out.buf.length > 64){
            res.setHeader('Content-Type', out.ct || 'image/png');
            res.setHeader('Cache-Control', 'no-store');
            res.status(200).send(out.buf);
            return;
          }
          errs.push('empty');
        } catch (e){ errs.push(e.message); }
      }
      res.status(502).json({
        error: 'edit-unsupported',
        reason: 'The hosted editor did not accept any edit method (' + errs.join(', ') +
          '). Pollinations may not support image editing \u2014 use your own server for Edit, or set POLLINATIONS_EDIT_URL / _MODEL.'
      });
      return;
    }

    const url = GEN_ENDPOINT + encodeURIComponent(prompt) +
      '?width=' + width + '&height=' + height + '&seed=' + seed + '&model=flux&nologo=true';
    const gen = await fetch(url);
    if (!gen.ok){ res.status(502).json({ error: 'upstream', reason: 'Generation service is unavailable (HTTP ' + gen.status + ').' }); return; }
    const buf = Buffer.from(await gen.arrayBuffer());
    res.setHeader('Content-Type', gen.headers.get('content-type') || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).send(buf);
  } catch (e){
    res.status(502).json({ error: 'upstream', reason: 'Request failed: ' + (e && e.message ? e.message : 'unknown') });
  }
}
