// Vercel serverless function — /api/generate
//
// Put this file at:  <your-repo>/api/generate.js
// It runs ONLY on the server. The blocklist below is enforced here, so it cannot
// be bypassed by editing the front-end (a public repo is fine — seeing the list
// doesn't let anyone skip the check). It also proxies the image through your own
// domain, so the returned picture is same-origin and stays editable/exportable
// on the canvas (no CORS/"tainted canvas" problem).
//
// Front-end calls:  /api/generate?prompt=...&width=1024&height=1024&seed=123
//   200  -> image bytes (image/png)
//   400  -> { error, reason }  (empty or blocked prompt)
//   502  -> { error, reason }  (upstream generation service failed)

export const config = { maxDuration: 60 };

// If Pollinations' image-edit endpoint differs, change this one line.
const EDIT_ENDPOINT = 'https://gen.pollinations.ai/v1/images/edits';
const GEN_ENDPOINT = 'https://image.pollinations.ai/prompt/';

// Terms blocked on their own (unambiguously disallowed).
const ALWAYS_BLOCK = [
  'loli', 'lolicon', 'shota', 'shotacon', 'csam',
  'child porn', 'childporn', 'child pornography', 'child sex', 'child abuse',
  'pedophile', 'pedophilia', 'paedophile', 'paedophilia',
  'rape', 'raping', 'rapist', 'molest', 'molesting', 'molestation',
  'incest', 'non-consensual', 'nonconsensual', 'noncon',
  'bestiality', 'zoophilia', 'necrophilia', 'snuff'
];

// Words indicating a minor.
const MINOR = [
  'child', 'children', 'kid', 'kids', 'toddler', 'toddlers', 'infant', 'infants',
  'baby', 'babies', 'preteen', 'pre-teen', 'preadolescent',
  'teen', 'teens', 'teenage', 'teenaged', 'teenager', 'teenagers',
  'underage', 'minor', 'minors', 'schoolgirl', 'schoolboy', 'schoolgirls', 'schoolboys',
  'little girl', 'little boy', 'little girls', 'little boys',
  'young girl', 'young boy', 'young girls', 'young boys',
  'kindergarten', 'kindergartener', 'preschool', 'preschooler', 'newborn', 'grade schooler'
];

// Sexual / explicit words (blocked only in combination with a MINOR word).
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
  if (/[^a-z0-9]/.test(term)) return text.indexOf(term) >= 0; // phrase -> substring
  return new RegExp('\\b' + term + '\\b').test(text);          // word -> whole word
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

export default async function handler(req, res){
  try {
    const method = (req.method || 'GET').toUpperCase();
    let prompt, width, height, seed, image = '';
    if (method === 'POST'){
      const b = (req.body && typeof req.body === 'object') ? req.body : {};
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

    let upstream;
    if (image){
      // ---- IMAGE EDIT (OpenAI-compatible /v1/images/edits, multipart) ----
      // Verify against Pollinations' current edit API; adjust EDIT_ENDPOINT / fields
      // above if the contract differs. Fails gracefully (502) either way.
      const m = /^data:([^;]+);base64,(.*)$/.exec(image);
      const mime = m ? m[1] : 'image/png';
      const b64 = m ? m[2] : image;
      const inBuf = Buffer.from(b64, 'base64');
      const form = new FormData();
      form.append('image', new Blob([inBuf], { type: mime }), 'image.png');
      form.append('prompt', prompt);
      form.append('model', 'flux');
      form.append('size', width + 'x' + height);
      const r = await fetch(EDIT_ENDPOINT, { method: 'POST', body: form });
      if (!r.ok){
        res.status(502).json({ error: 'upstream', reason: 'Image editing is unavailable right now.' });
        return;
      }
      const ct = (r.headers.get('content-type') || '').toLowerCase();
      if (ct.indexOf('application/json') >= 0){
        const j = await r.json();
        const item = j && j.data && j.data[0];
        let outBuf = null, outCt = 'image/png';
        if (item && item.b64_json){
          outBuf = Buffer.from(item.b64_json, 'base64');
        } else if (item && item.url){
          const ir = await fetch(item.url);
          if (!ir.ok){ res.status(502).json({ error: 'upstream', reason: 'Could not fetch the edited image.' }); return; }
          outBuf = Buffer.from(await ir.arrayBuffer());
          outCt = ir.headers.get('content-type') || 'image/png';
        }
        if (!outBuf){ res.status(502).json({ error: 'upstream', reason: 'Editor returned no image.' }); return; }
        res.setHeader('Content-Type', outCt);
        res.setHeader('Cache-Control', 'no-store');
        res.status(200).send(outBuf);
        return;
      }
      const outBuf = Buffer.from(await r.arrayBuffer());
      res.setHeader('Content-Type', ct || 'image/png');
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).send(outBuf);
      return;
    }

    const url = GEN_ENDPOINT + encodeURIComponent(prompt) +
      '?width=' + width + '&height=' + height + '&seed=' + seed + '&model=flux&nologo=true';
    upstream = await fetch(url);
    if (!upstream.ok){
      res.status(502).json({ error: 'upstream', reason: 'Generation service is unavailable right now.' });
      return;
    }
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).send(buf);
  } catch (e){
    res.status(502).json({ error: 'upstream', reason: 'Generation failed. Please try again.' });
  }
}
