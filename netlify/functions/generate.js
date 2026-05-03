import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const THEME_GUIDES = {
  trustworthy: {
    label: 'Trustworthy',
    css: `
COLORS: background #ffffff, primary navy #1B3A6B, accent blue #2563eb, text #1e293b, headings #0f172a, section-bg #f8fafc.
FONTS: Georgia, 'Times New Roman', serif for headings (bold, authoritative); system-ui for body text.
STYLE: Clean professional layout. Large hero with business name in bold serif. Subtle box-shadows (0 4px 16px rgba(0,0,0,0.08)). Rounded corners 8px. Grid layout for service cards. Generous whitespace. Navy CTA buttons that turn slightly lighter on hover.
TRUST BADGES: Include a "Why Choose Us" row with 3 badges: "✓ Licensed & Insured", "⭐ 5-Star Rated", "💰 Free Estimates" — styled as pill badges in navy with white text.
HERO: Deep navy gradient background (linear-gradient(135deg, #1B3A6B 0%, #2563eb 100%)), white headline text, white subheadline, two white-outlined CTA buttons.
TONE: Professional and reassuring. Words like "trusted", "reliable", "certified", "expert", "professional".`,
  },
  bold: {
    label: 'Bold',
    css: `
COLORS: background #000000 (pure black), primary red #FF0000, accent white #ffffff, text #f5f5f5, headings #ffffff, card-bg #111111.
FONTS: system-ui with weight 900 for headings (massive, full-width). Clean sans-serif body.
STYLE: Full-width sections edge to edge. Giant typography — hero headline font-size min 64px. Pure black background throughout. Red CTA buttons with white text. Cards with 1px red border. Minimal decoration, maximum impact. Hover effects that turn red.
HERO: Black background, giant white headline taking up most of the hero, red accent line under it, bold red CTA button.
TONE: Aggressive and confident. Words like "dominate", "results", "powerful", "get it done", "no excuses".`,
  },
  warm: {
    label: 'Cute & Warm',
    css: `
COLORS: background #FFFDD0 (cream), primary pink #FFB6C1, accent #FF69B4 (hot pink), text #5c2d3a, headings #3d1a24, card-bg #fff0f3.
FONTS: system-ui with slightly rounded feel; body font-size 16px; warm friendly sizes.
STYLE: Rounded corners 20px on EVERYTHING — buttons, cards, inputs, sections. Soft pink box-shadows. Decorative heart (♥) and flower (✿) CSS elements in section headers. Pastel service cards with pink gradient backgrounds. Inputs with thick pink border on focus.
HERO: Soft pink-to-cream gradient (linear-gradient(135deg, #FFB6C1 0%, #FFFDD0 100%)), warm headline, decorative hearts.
TONE: Warm and personal. Words like "we love what we do", "caring", "friendly", "here for you", "our family serving yours".`,
  },
  exciting: {
    label: 'Exciting',
    css: `
COLORS: primary orange #FF6B35, accent yellow #FFE134, background #fff8f0, text #1a0a00, headings #cc3d00, card-bg #ffffff.
FONTS: system-ui weight 800-900 for headings. Bold and energetic throughout.
STYLE: Vibrant animated gradient hero using CSS @keyframes (animate the background-position of a orange-to-yellow gradient). Rounded cards with orange-to-yellow gradient border. Bold CTAs with gradient background. Section dividers as diagonal CSS shapes using clip-path. High energy layout.
HERO: Animated gradient (keyframes shifting orange→yellow→orange), large white headline, bright yellow CTA button with orange text.
TONE: Enthusiastic. Words like "amazing", "let's go", "we bring the energy", "get started today", "you deserve the best".`,
  },
  elegant: {
    label: 'Elegant',
    css: `
COLORS: background #1A1A1A (deep black), primary gold #C9A84C, accent #e8d5a3 (light gold), text #d4c9b8, headings #ffffff, section-bg #141414.
FONTS: Georgia, 'Times New Roman', serif for ALL headings. system-ui for body. Letter-spacing 2-3px on section labels (uppercase).
STYLE: Fine 1px gold borders on cards and sections. Generous padding (80px+ sections). Thin gold horizontal rules as dividers. Subtle gold box-shadow on cards. Uppercase section labels with wide letter-spacing. Hover effects that glow gold.
HERO: Near-black background with a very subtle gold radial gradient glow, large white serif headline, gold CTA button.
TONE: Refined and exclusive. Words like "premier", "bespoke", "distinguished", "artisan", "curated", "where excellence meets craft".`,
  },
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS }
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  try {
    const body = JSON.parse(event.body)

    if (body.type === 'website') {
      const html = await handleGenerateWebsite(body)
      return ok({ html })
    }

    if (body.type === 'update') {
      const html = await handleUpdateWebsite(body)
      return ok({ html })
    }

    if (body.type === 'support') {
      const answer = await handleSupportQuestion(body)
      return ok({ answer })
    }

    return { statusCode: 400, body: JSON.stringify({ error: 'Unknown type' }) }
  } catch (err) {
    console.error('generate function error:', err)
    const isTimeout = err.code === 'ECONNRESET' || err.message?.includes('timeout') || err.status === 529
    return {
      statusCode: isTimeout ? 504 : 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: isTimeout
          ? 'Generation timed out. Please try again — it usually works on the second attempt.'
          : (err.message ?? 'Internal server error'),
      }),
    }
  }
}

function ok(data) {
  return {
    statusCode: 200,
    headers: { ...CORS, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }
}

function injectBaseStyle(html) {
  return html.replace(/<head>/i, '<head><style>html,body{background:#fff}</style>')
}

function sanitizeHtml(html) {
  const openCount  = (html.match(/<style[\s>]/gi) || []).length
  const closeCount = (html.match(/<\/style>/gi)   || []).length
  console.log('[SF-SERVER] style tag count open:', openCount, 'close:', closeCount)

  // Fast path — style tags balanced, body has content
  const bodyMatch = html.match(/<body[\s>]/i)
  const bodyClose = html.match(/<\/body>/i)
  if (openCount === closeCount && bodyMatch && bodyClose) return html

  // ── Approach: extract all CSS text, strip all <style> blocks, rebuild cleanly ──
  const cssChunks = []
  // Grab everything inside every <style>...</style> pair (partial or complete)
  const styleOpenRe = /<style[^>]*>([\s\S]*?)(?:<\/style>|$)/gi
  let m
  while ((m = styleOpenRe.exec(html)) !== null) {
    cssChunks.push(m[1])
  }
  // Also grab any trailing CSS after the last unclosed <style> tag
  const lastUnclosed = html.lastIndexOf('<style')
  const lastClose    = html.lastIndexOf('</style>')
  if (lastUnclosed > lastClose) {
    const trailingCss = html.slice(html.indexOf('>', lastUnclosed) + 1)
    // Only add if it looks like CSS (contains { or })
    if (trailingCss.includes('{')) cssChunks.push(trailingCss)
  }

  const combinedCss = cssChunks.join('\n')

  // Remove all <style>...</style> blocks (and any unclosed trailing style content)
  let stripped = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    // Remove any remaining unclosed <style ...> and everything after it up to <body or </head
    .replace(/<style[^>]*>[\s\S]*/i, '')

  // If body tag is now missing (was consumed as "CSS text"), try to recover body from stripped
  if (!/<body[\s>]/i.test(stripped)) {
    // Everything after </head> or after the removed style section is the body content
    const headEnd = stripped.search(/<\/head>/i)
    if (headEnd !== -1) {
      const head = stripped.slice(0, headEnd + 7)
      const rest = stripped.slice(headEnd + 7).trim()
      stripped = head + '\n<body>\n' + rest + (rest.includes('</body>') ? '' : '\n</body>') + (rest.includes('</html>') ? '' : '\n</html>')
    }
  }

  // ── Extract all <script> blocks before further stripping ──────────────────
  const scriptChunks = []
  const scriptRe = /<script[^>]*>([\s\S]*?)(?:<\/script>|$)/gi
  let s
  while ((s = scriptRe.exec(stripped)) !== null) {
    if (s[1].trim()) scriptChunks.push(s[1])
  }
  // Catch any unclosed trailing <script> tag
  const lastScriptOpen  = stripped.lastIndexOf('<script')
  const lastScriptClose = stripped.lastIndexOf('</script>')
  if (lastScriptOpen > lastScriptClose) {
    const trailingJs = stripped.slice(stripped.indexOf('>', lastScriptOpen) + 1)
    if (trailingJs.trim()) scriptChunks.push(trailingJs)
  }
  // Strip all <script> blocks (closed and unclosed)
  stripped = stripped
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<script[^>]*>[\s\S]*/i, '')

  // Re-inject the combined CSS as a single clean <style> block in <head>
  const cleanStyle = `<style>\n${combinedCss}\n</style>`
  let rebuilt = stripped.replace(/<\/head>/i, cleanStyle + '\n</head>')

  // Re-inject all scripts as one clean <script> block before </body>
  if (scriptChunks.length) {
    const cleanScript = `<script>\n${scriptChunks.join('\n')}\n</script>`
    rebuilt = rebuilt.replace(/<\/body>/i, cleanScript + '\n</body>')
  }

  console.log('[SF-SERVER] sanitized — body present:', /<body[\s>]/i.test(rebuilt), 'scripts:', scriptChunks.length, 'html closes:', rebuilt.trimEnd().toLowerCase().endsWith('</html>'))
  return rebuilt
}

// ── Website generation ────────────────────────────────────────────────────────

async function handleGenerateWebsite({
  businessName, businessType, city, state, businessDescription,
  themeVibe, phone, email, businessHours, address, facebook, instagram,
  photoBase64, photoMimeType,
}) {
  const theme = THEME_GUIDES[themeVibe] ?? THEME_GUIDES.trustworthy
  const telDigits = phone ? phone.replace(/\D/g, '') : '5550000000'

  const contactBlock = [
    phone         ? `- Phone: ${phone}`                        : null,
    email         ? `- Email: ${email}`                        : null,
    businessHours ? `- Business Hours: ${businessHours}`       : null,
    address       ? `- Address / Service Area: ${address}`     : null,
    facebook      ? `- Facebook: ${facebook}`                  : null,
    instagram     ? `- Instagram: ${instagram}`                : null,
  ].filter(Boolean).join('\n')

  const prompt = `You are a senior web designer at a world-class creative agency. Build a premium single-page business website that looks like it cost $5,000. Every visual detail must be polished and intentional.

BUSINESS: ${businessName} | ${businessType} | ${city}, ${state}${businessDescription ? ` | ${businessDescription}` : ''}
${contactBlock || ''}
THEME — "${theme.label}":
${theme.css}

TYPOGRAPHY: Add this Google Fonts link in <head>: <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Playfair+Display:wght@700;800&display=swap" rel="stylesheet">
Use Inter for body text. Use Playfair Display for hero headline only.

REQUIRED SECTIONS — ALL MANDATORY:

1. NAV: Fixed top. Logo/name left. Phone as styled pill button right (tel:${telDigits}). Backdrop-filter: blur(12px) with semi-transparent background. Box-shadow on scroll via JS class toggle.

2. HERO (min-height: 90vh, display:flex, align-items:center): Theme gradient background. Centered content. Business name in Playfair Display, 72px desktop / 42px mobile, with a colored text gradient using background-clip:text. Subheadline in Inter 20px. Two CTA buttons: solid primary + ghost outline. A subtle decorative shape or pattern in the background using CSS (circles, lines, or gradient blobs using pseudo-elements).

3. ABOUT: Two-column layout on desktop (text left, decorative right). Compelling 3-sentence copy. A colored accent bar before the heading. A stat row showing 3 trust numbers (e.g. "500+ Clients", "15 Years", "100% Satisfaction").

4. SERVICES: Section heading centered. CSS Grid, 3 columns desktop / 1 mobile. Each card: large emoji (48px), bold title, 2-sentence description, subtle border, background white, border-radius:16px, box-shadow, transform:translateY(-6px) on hover with transition 0.3s.

5. LEAD FORM (MANDATORY — NEVER OMIT): Full-width section with contrasting background. Heading + subheading. Form id="contact-form". Fields: name="name", name="phone", name="email", name="message". Each input: padding 14px 18px, border-radius 10px, border 2px solid, focus outline in theme color. Large submit button full-width, theme gradient, font-weight:700.${businessHours ? ` Hours: ${businessHours}.` : ''}${address ? ` Address: ${address}.` : ''}

6. FOOTER: Dark background. Three columns: brand + tagline, quick links, contact info. Bottom bar with copyright "© ${new Date().getFullYear()} ${businessName}. All rights reserved."

7. FLOATING CTA: position:fixed, bottom:28px, right:28px. Pill button "📞 Call Now" → tel:${telDigits}. Theme primary color, box-shadow, pulse animation using @keyframes.${photoBase64 ? `\n\n8. PHOTO: Display in hero or about section. src="__BUSINESS_PHOTO__". Border-radius:16px, box-shadow.` : ''}

CSS CRAFT — THIS MUST LOOK PREMIUM:
- CSS custom properties (--primary, --accent, --text, --bg) defined on :root
- Hero gradient: bold, theme-specific, NOT plain white
- All interactive elements: smooth transitions (0.2s–0.3s ease)
- Cards: white background, border-radius 16px, box-shadow 0 4px 24px rgba(0,0,0,0.08), hover lift
- Section padding: 96px 0 desktop, 64px 0 mobile
- Max-width 1200px centered container with padding 0 24px
- Mobile-first, @media(min-width:768px) for 2-col, @media(min-width:1024px) for full layout

JAVASCRIPT RULES:
- Only addEventListener, querySelector, classList — no eval(), no new Function(), no string setTimeout/setInterval
- One <script> block before </body>

OUTPUT RULES — CRITICAL:
- Start with <!DOCTYPE html>, end with </html>. Nothing before or after.
- No markdown, no code fences, no explanation.
- All CSS in one <style> tag in <head>. Google Fonts link before the style tag.`

  const messageContent = [{ type: 'text', text: prompt }]
  if (photoBase64) {
    messageContent.push({
      type: 'image',
      source: { type: 'base64', media_type: photoMimeType || 'image/jpeg', data: photoBase64 },
    })
  }

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    messages: [{ role: 'user', content: messageContent }],
  })

  let raw = message.content[0].text.trim()
  // Strip code fences if Claude wrapped the output
  raw = raw.replace(/^```[\w]*\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  // Extract the HTML document — grab from <!DOCTYPE html> to </html>, discarding any preamble
  const docMatch = raw.match(/<!doctype\s+html[\s\S]*<\/html>/i)
  let html = docMatch ? docMatch[0] : raw

  // Truncation recovery: if max_tokens cut the response short, close any open document
  if (!html.trimEnd().toLowerCase().endsWith('</html>')) {
    console.warn('[SF-SERVER] HTML appears truncated — patching close tags')
    html = html + '\n</body></html>'
  }

  // Fix unclosed/mismatched style blocks that cause body to parse as CSS text
  html = sanitizeHtml(html)

  if (photoBase64) {
    html = html.replace(
      'src="__BUSINESS_PHOTO__"',
      `src="data:${photoMimeType || 'image/jpeg'};base64,${photoBase64}"`
    )
  }

  return injectBaseStyle(html)
}

// ── Content update ────────────────────────────────────────────────────────────

async function handleUpdateWebsite({ currentHtml, request }) {
  const prompt = `You are editing an existing business website. Apply the user's requested change and return the full updated HTML.

User's request: "${request}"

Current website HTML:
${currentHtml}

Requirements:
1. Apply the requested change. Keep everything else exactly the same.
2. Output ONLY the complete updated HTML — no markdown, no code fences, no explanation.
3. Start with <!DOCTYPE html> and end with </html>.`

  const message = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw2 = message.content[0].text.trim()
    .replace(/^```[\w]*\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  const docMatch2 = raw2.match(/<!doctype\s+html[\s\S]*<\/html>/i)
  return injectBaseStyle(docMatch2 ? docMatch2[0] : raw2)
}

// ── Support chat ──────────────────────────────────────────────────────────────

async function handleSupportQuestion({ question }) {
  const message = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 400,
    system: `You are a friendly, helpful support assistant for SiteForge — an AI-powered website builder for small businesses.
Key facts:
- SiteForge builds professional websites in 60 seconds using AI
- Plan: $19.99/month, all-inclusive, cancel anytime
- Features: AI website generation, lead forms, click-to-call, theme changes, content updates, hosting, SSL, mobile-ready
- Support email: support@siteforge.co
Keep answers short, warm, and plain — no jargon. Write as if helping someone who is not tech-savvy. If unsure, suggest emailing support@siteforge.co.`,
    messages: [{ role: 'user', content: question }],
  })

  return message.content[0].text
}
