/* Font loading: Indian Type Foundry via Fontshare, plus Google Fonts, plus user-uploaded faces. */

export type FontSource = 'itf' | 'google' | 'custom' | 'system';

export interface FontOption {
  family: string;
  source: FontSource;
  category?: string;
}

export const ITF_FONTS: FontOption[] = [
  { family: 'Panchang', source: 'itf', category: 'Sans' },
  { family: 'Supreme', source: 'itf', category: 'Sans' },
  { family: 'General Sans', source: 'itf', category: 'Sans' },
  { family: 'Satoshi', source: 'itf', category: 'Sans' },
  { family: 'Switzer', source: 'itf', category: 'Sans' },
  { family: 'Synonym', source: 'itf', category: 'Sans' },
  { family: 'Technor', source: 'itf', category: 'Sans' },
  { family: 'Cabinet Grotesk', source: 'itf', category: 'Sans' },
  { family: 'Clash Display', source: 'itf', category: 'Display' },
  { family: 'Tanker', source: 'itf', category: 'Display' },
  { family: 'Author', source: 'itf', category: 'Sans' },
  { family: 'Chillax', source: 'itf', category: 'Sans' },
  { family: 'Boska', source: 'itf', category: 'Serif' },
  { family: 'Gambetta', source: 'itf', category: 'Serif' },
  { family: 'Rowan', source: 'itf', category: 'Serif' },
  { family: 'Gambarino', source: 'itf', category: 'Serif' },
  { family: 'Zodiak', source: 'itf', category: 'Serif' },
  { family: 'Melodrama', source: 'itf', category: 'Display' },
  { family: 'Kihim', source: 'itf', category: 'Display' },
  { family: 'Comico', source: 'itf', category: 'Handwritten' },
  { family: 'Bespoke Serif', source: 'itf', category: 'Serif' },
];

export const GOOGLE_FONTS: FontOption[] = [
  { family: 'Inter', source: 'google', category: 'Sans' },
  { family: 'DM Sans', source: 'google', category: 'Sans' },
  { family: 'Manrope', source: 'google', category: 'Sans' },
  { family: 'Space Grotesk', source: 'google', category: 'Sans' },
  { family: 'Archivo', source: 'google', category: 'Sans' },
  { family: 'Archivo Black', source: 'google', category: 'Display' },
  { family: 'Anton', source: 'google', category: 'Display' },
  { family: 'Bebas Neue', source: 'google', category: 'Display' },
  { family: 'Oswald', source: 'google', category: 'Display' },
  { family: 'Montserrat', source: 'google', category: 'Sans' },
  { family: 'Poppins', source: 'google', category: 'Sans' },
  { family: 'Sora', source: 'google', category: 'Sans' },
  { family: 'Unbounded', source: 'google', category: 'Display' },
  { family: 'Syne', source: 'google', category: 'Display' },
  { family: 'Epilogue', source: 'google', category: 'Sans' },
  { family: 'Bricolage Grotesque', source: 'google', category: 'Display' },
  { family: 'Playfair Display', source: 'google', category: 'Serif' },
  { family: 'DM Serif Display', source: 'google', category: 'Serif' },
  { family: 'Lora', source: 'google', category: 'Serif' },
  { family: 'Libre Baskerville', source: 'google', category: 'Serif' },
  { family: 'Cormorant Garamond', source: 'google', category: 'Serif' },
  { family: 'Instrument Serif', source: 'google', category: 'Serif' },
  { family: 'Newsreader', source: 'google', category: 'Serif' },
  { family: 'Fraunces', source: 'google', category: 'Serif' },
  { family: 'Bodoni Moda', source: 'google', category: 'Serif' },
  { family: 'JetBrains Mono', source: 'google', category: 'Mono' },
  { family: 'IBM Plex Mono', source: 'google', category: 'Mono' },
  { family: 'Courier Prime', source: 'google', category: 'Mono' },
];

const SYSTEM_FONTS: FontOption[] = [
  { family: 'Helvetica Neue', source: 'system', category: 'System' },
  { family: 'Georgia', source: 'system', category: 'System' },
  { family: 'Times New Roman', source: 'system', category: 'System' },
  { family: 'Courier New', source: 'system', category: 'System' },
];

const loading = new Map<string, Promise<boolean>>();
const ready = new Set<string>();
const sourceOf = new Map<string, FontSource>();

for (const f of SYSTEM_FONTS) sourceOf.set(f.family, 'system');
for (const f of ITF_FONTS) sourceOf.set(f.family, 'itf');
for (const f of GOOGLE_FONTS) sourceOf.set(f.family, 'google');

export function allFontOptions(custom: FontOption[]): {
  itf: FontOption[];
  google: FontOption[];
  custom: FontOption[];
  system: FontOption[];
} {
  return { itf: ITF_FONTS, google: GOOGLE_FONTS, custom, system: SYSTEM_FONTS };
}

export function cssFamily(family: string): string {
  return `"${family.replace(/"/g, '')}", "Supreme", -apple-system, sans-serif`;
}

function injectStylesheet(href: string): Promise<boolean> {
  return new Promise((resolve) => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    link.onload = () => resolve(true);
    link.onerror = () => resolve(false);
    document.head.appendChild(link);
  });
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function waitForFamily(family: string, timeoutMs = 7000): Promise<boolean> {
  const probe = `16px ${cssFamily(family)}`;
  try {
    await Promise.race([document.fonts.load(probe), sleep(timeoutMs)]);
  } catch {
    /* ignore */
  }
  if (document.fonts.check(probe)) return true;
  // give slow networks one more moment
  await sleep(400);
  return document.fonts.check(probe);
}

function slugFor(family: string): string {
  return family.toLowerCase().trim().replace(/\s+/g, '-');
}

async function loadITF(family: string): Promise<boolean> {
  const slug = slugFor(family);
  const withWeights = `https://api.fontshare.com/v2/css?f[]=${slug}@400,500,700&display=swap`;
  const ok = await injectStylesheet(withWeights);
  if (ok && (await waitForFamily(family))) return true;
  const plain = `https://api.fontshare.com/v2/css?f[]=${slug}&display=swap`;
  const ok2 = await injectStylesheet(plain);
  if (ok2 && (await waitForFamily(family))) return true;
  return false;
}

async function loadGoogle(family: string): Promise<boolean> {
  const enc = family.trim().replace(/\s+/g, '+');
  const withWeights = `https://fonts.googleapis.com/css2?family=${enc}:wght@400;500;700&display=swap`;
  const ok = await injectStylesheet(withWeights);
  if (ok && (await waitForFamily(family))) return true;
  const plain = `https://fonts.googleapis.com/css2?family=${enc}&display=swap`;
  const ok2 = await injectStylesheet(plain);
  if (ok2 && (await waitForFamily(family))) return true;
  return false;
}

/** Load any family by name, deciding where to fetch it from. Resolves true when usable. */
export function ensureFont(family: string): Promise<boolean> {
  if (!family) return Promise.resolve(false);
  if (ready.has(family)) return Promise.resolve(true);
  const existing = loading.get(family);
  if (existing) return existing;
  const src = sourceOf.get(family) ?? 'google';
  const p = (async () => {
    let ok = false;
    if (src === 'system') {
      ok = true;
    } else if (src === 'itf') {
      ok = await loadITF(family);
      if (!ok) ok = await loadGoogle(family);
    } else {
      ok = await loadGoogle(family);
    }
    if (ok) ready.add(family);
    else loading.delete(family);
    return ok;
  })();
  loading.set(family, p);
  return p;
}

/** Register a user-supplied font file (ttf / otf / woff / woff2). */
export async function registerCustomFont(
  family: string,
  buffer: ArrayBuffer,
  weight = 400,
  style: 'normal' | 'italic' = 'normal',
): Promise<boolean> {
  try {
    const face = new FontFace(family, buffer, { weight: String(weight), style });
    await face.load();
    (document.fonts as unknown as { add: (f: FontFace) => void }).add(face);
    ready.add(family);
    sourceOf.set(family, 'custom');
    return true;
  } catch {
    return false;
  }
}

export async function ensureFonts(families: string[]): Promise<void> {
  await Promise.all(families.map((f) => ensureFont(f).catch(() => false)));
}

export function isFontReady(family: string): boolean {
  return ready.has(family);
}

export const DISPLAY_FONTS = new Set([
  'Panchang',
  'Supreme',
  'Clash Display',
  'Tanker',
  'Melodrama',
  'Kihim',
  'Gambarino',
  'Anton',
  'Bebas Neue',
  'Archivo Black',
  'Unbounded',
  'Syne',
  'Bricolage Grotesque',
  'Instrument Serif',
  'DM Serif Display',
]);
