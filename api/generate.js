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
    const q = (req && req.query) || {};
    const prompt = String(q.prompt || '').slice(0, 800).trim();
    const width = round8(clampInt(q.width, 64, 2048, 1024));
    const height = round8(clampInt(q.height, 64, 2048, 1024));
    const seed = clampInt(q.seed, 0, 999999999, Math.floor(Math.random() * 1e9));

    if (!prompt){
      res.status(400).json({ error: 'empty', reason: 'Enter a prompt.' });
      return;
    }
    if (isBlocked(prompt)){
      res.status(400).json({ error: 'blocked', reason: 'That prompt isn\u2019t allowed.' });
      return;
    }

    const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(prompt) +
      '?width=' + width + '&height=' + height + '&seed=' + seed + '&model=flux&nologo=true';

    const upstream = await fetch(url);
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
