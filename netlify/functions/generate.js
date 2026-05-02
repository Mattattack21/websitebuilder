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

  const prompt = `You are a professional web designer at a top creative agency. Create a stunning, modern, beautifully designed business website. This must look like it was crafted by a professional agency — not a generic template. Use creative CSS including gradients, box-shadows, hover effects, and animations to make it visually impressive.

BUSINESS DETAILS:
- Name: ${businessName}
- Type: ${businessType}
- Location: ${city}, ${state}${businessDescription ? `\n- About: ${businessDescription}` : ''}
${contactBlock || ''}
DESIGN THEME — "${theme.label}":
${theme.css}

REQUIRED SECTIONS — ALL MUST BE PRESENT, NO EXCEPTIONS:

1. STICKY NAV: Business name/logo on left. Phone as click-to-call (tel:${telDigits}) on right. Background matches theme. Stays fixed at top on scroll. Subtle drop-shadow when scrolling (use JS scroll listener to add class).

2. HERO (full-width, min-height 85vh): Theme-specific background (gradient or dark). Large bold headline featuring the business name. Compelling subheadline/tagline written for this specific business. Two CTA buttons side by side: primary "Get a Free Quote" and secondary "📞 Call Now" linking tel:${telDigits}. Visually stunning — this is the first thing visitors see.

3. ABOUT US: 2–3 sentences of warm, specific copy written for ${businessName} in ${city}, ${state}. Include a decorative element (CSS shape, colored accent bar, or icon) that matches the theme. Make it personal and trust-building.

4. SERVICES (grid layout): Exactly 3 service cards. Each card has: a large emoji icon, a bold service name, and a 1-2 sentence description. Services must be realistic for a ${businessType} business. Cards have hover effects (lift + shadow on hover). Use CSS grid, 3 columns on desktop, 1 on mobile.

5. LEAD CAPTURE FORM — THIS SECTION IS MANDATORY AND MUST ALWAYS BE INCLUDED:
   - Section heading like "Get a Free Quote" or "Contact Us Today"
   - The form element MUST have: id="contact-form"
   - Field with name="name" (text input, placeholder "Your Name")
   - Field with name="phone" (tel input, placeholder "Your Phone Number")
   - Field with name="email" (email input, placeholder "Your Email")
   - Field with name="message" (textarea, placeholder "Tell us about your project...")
   - Submit button styled prominently in the theme's primary color
   - Form styled to match the theme with proper focus states${businessHours ? `\n   - Show business hours: ${businessHours}` : ''}${address ? `\n   - Show address: ${address}` : ''}

6. FOOTER: Business name, phone (click-to-call), email, address, hours if provided, social links if provided. Copyright line "© ${new Date().getFullYear()} ${businessName}. All rights reserved." Styled to match the theme.

7. STICKY CALL BUTTON: A fixed button in the bottom-right corner (position: fixed, bottom: 24px, right: 24px, z-index: 9999). Shows "📞 Call Now" and links to tel:${telDigits}. Styled as a round or pill button in the theme's primary CTA color. Visible on all screen sizes.${photoBase64 ? `\n\n8. BUSINESS PHOTO: Display the provided photo in the hero or about section. Use src="__BUSINESS_PHOTO__" exactly. Style naturally within the design.` : ''}

CSS REQUIREMENTS — MAKE IT BEAUTIFUL:
- Use CSS gradients on hero section and CTA buttons
- Box-shadows on cards and nav (not heavy — tasteful)
- Smooth hover transitions (0.2s ease) on all interactive elements
- CSS animations: at minimum the hero text should fade/slide in on load (@keyframes)
- Mobile-first: perfect at 375px, beautiful at 1200px+. Use @media (min-width: 768px) breakpoints.
- Inputs and textarea: styled with border, padding 12px 16px, border-radius matching theme, focus state with colored outline

OUTPUT FORMAT — CRITICAL:
- Your response MUST start with exactly: <!DOCTYPE html>
- Your response MUST end with exactly: </html>
- Do NOT write anything before <!DOCTYPE html> or after </html>
- Do NOT use markdown, code fences, backticks, or any explanation text whatsoever
- ALL CSS inside a single <style> tag in <head> — zero external stylesheets or CDN links
- All JavaScript inline in a <script> tag before </body>`

  const messageContent = [{ type: 'text', text: prompt }]
  if (photoBase64) {
    messageContent.push({
      type: 'image',
      source: { type: 'base64', media_type: photoMimeType || 'image/jpeg', data: photoBase64 },
    })
  }

  const message = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 4500,
    messages: [{ role: 'user', content: messageContent }],
  })

  let raw = message.content[0].text.trim()
  // Strip code fences if Claude wrapped the output
  raw = raw.replace(/^```[\w]*\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  // Extract the HTML document — grab from <!DOCTYPE html> to </html>, discarding any preamble
  const docMatch = raw.match(/<!doctype\s+html[\s\S]*<\/html>/i)
  let html = docMatch ? docMatch[0] : raw

  if (photoBase64) {
    html = html.replace(
      'src="__BUSINESS_PHOTO__"',
      `src="data:${photoMimeType || 'image/jpeg'};base64,${photoBase64}"`
    )
  }

  return html
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
  return docMatch2 ? docMatch2[0] : raw2
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
