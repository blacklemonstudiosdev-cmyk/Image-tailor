// Vercel serverless function — /api/generate   (put at <repo>/api/generate.js)
//
// GET  ?prompt=&width=&height=&seed=      -> text-to-image (keyless Pollinations), image bytes
// POST { prompt, image, width, height }   -> image edit (img2img)
// 400 = empty/blocked prompt   502 = upstream failed (reason explains why)
//
// EDIT needs the source image at a PUBLIC URL (Pollinations' free img2img is
// ?image=<url>). So this uploads the image to ImgBB (free) to get a URL, then
// calls Pollinations. Set a free ImgBB key as the env var IMGBB_KEY in Vercel.
// Overridable env vars: IMGBB_KEY, POLLINATIONS_EDIT_MODEL (default 'flux').

export const config = { maxDuration: 60 };

const GEN_ENDPOINT = 'https://image.pollinations.ai/prompt/';

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

async function uploadForPublicUrl(imageDataUrl){
  const key = process.env.IMGBB_KEY || '';
  if (!key) return { error: 'Hosted Edit needs a free ImgBB key. Add IMGBB_KEY in Vercel \u2192 Settings \u2192 Environment Variables (or use your own server for Edit).' };
  const up = await fetch('https://api.imgbb.com/1/upload?expiration=600&key=' + encodeURIComponent(key), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'image=' + encodeURIComponent(stripB64(imageDataUrl))
  });
  if (!up.ok) return { error: 'Image upload failed (HTTP ' + up.status + ').' };
  const uj = await up.json().catch(() => null);
  const url = uj && uj.data && (uj.data.url || uj.data.display_url);
  if (!url) return { error: 'Image host returned no URL.' };
  return { url };
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
    }
    seed = Math.floor(Math.random() * 1e9);

    if (!prompt){ res.status(400).json({ error: 'empty', reason: 'Enter a prompt.' }); return; }
    if (isBlocked(prompt)){ res.status(400).json({ error: 'blocked', reason: 'That prompt isn\u2019t allowed.' }); return; }

    let url;
    if (image){
      const host = await uploadForPublicUrl(image);
      if (host.error){ res.status(502).json({ error: 'edit-setup', reason: host.error }); return; }
      const model = process.env.POLLINATIONS_EDIT_MODEL || 'flux';
      url = GEN_ENDPOINT + encodeURIComponent(prompt) +
        '?image=' + encodeURIComponent(host.url) + '&model=' + encodeURIComponent(model) +
        '&width=' + width + '&height=' + height + '&seed=' + seed + '&nologo=true';
    } else {
      url = GEN_ENDPOINT + encodeURIComponent(prompt) +
        '?width=' + width + '&height=' + height + '&seed=' + seed + '&model=flux&nologo=true';
    }

    const r = await fetch(url);
    if (!r.ok){ res.status(502).json({ error: 'upstream', reason: (image ? 'Edit' : 'Generation') + ' endpoint returned HTTP ' + r.status + '.' }); return; }
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (ct.indexOf('image/') !== 0){ res.status(502).json({ error: 'upstream', reason: 'Did not get an image back (' + (ct || 'unknown') + ').' }); return; }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', image ? 'no-store' : 'public, max-age=3600');
    res.status(200).send(buf);
  } catch (e){
    res.status(502).json({ error: 'upstream', reason: 'Request failed: ' + (e && e.message ? e.message : 'unknown') });
  }
}
