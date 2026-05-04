import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.CLAUDE_API_KEY })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const THEMES = {
  trustworthy: {
    bg:'#f8fafc', primary:'#1B3A6B', accent:'#2563eb',
    text:'#1e293b', heading:'#0f172a',
    heroGradient:'linear-gradient(135deg,#1B3A6B 0%,#2563eb 100%)',
    heroText:'#fff', heroSub:'rgba(255,255,255,0.85)',
    outlineBtn:'border:2px solid rgba(255,255,255,0.7);color:#fff;background:transparent',
    navBg:'rgba(255,255,255,0.97)', navText:'#1B3A6B',
    cardBg:'#fff', cardShadow:'0 4px 24px rgba(0,0,0,0.08)',
    sectionAlt:'#f1f5f9', footerBg:'#0f172a',
    inputBorder:'#cbd5e1', inputBg:'#fff',
    btn:'background:linear-gradient(135deg,#1B3A6B,#2563eb);color:#fff',
    trustBg:'#1B3A6B',
    headingFont:"Georgia,'Times New Roman',serif",
  },
  bold: {
    bg:'#000', primary:'#FF0000', accent:'#FF0000',
    text:'#f5f5f5', heading:'#fff',
    heroGradient:'#000',
    heroText:'#fff', heroSub:'rgba(255,255,255,0.65)',
    outlineBtn:'border:2px solid #FF0000;color:#FF0000;background:transparent',
    navBg:'rgba(0,0,0,0.97)', navText:'#FF0000',
    cardBg:'#111', cardShadow:'0 4px 24px rgba(255,0,0,0.12)',
    sectionAlt:'#0a0a0a', footerBg:'#111',
    inputBorder:'#333', inputBg:'#111',
    btn:'background:#FF0000;color:#fff',
    trustBg:'#FF0000',
    headingFont:'-apple-system,BlinkMacSystemFont,sans-serif',
  },
  warm: {
    bg:'#FFFDD0', primary:'#FF69B4', accent:'#FF69B4',
    text:'#5c2d3a', heading:'#3d1a24',
    heroGradient:'linear-gradient(135deg,#FFB6C1 0%,#FFFDD0 100%)',
    heroText:'#3d1a24', heroSub:'rgba(92,45,58,0.72)',
    outlineBtn:'border:2px solid #FF69B4;color:#3d1a24;background:transparent',
    navBg:'rgba(255,253,208,0.97)', navText:'#3d1a24',
    cardBg:'#fff0f3', cardShadow:'0 4px 24px rgba(255,105,180,0.12)',
    sectionAlt:'#fff5f7', footerBg:'#3d1a24',
    inputBorder:'#FFB6C1', inputBg:'#fff',
    btn:'background:linear-gradient(135deg,#FF69B4,#FFB6C1);color:#fff',
    trustBg:'#FF69B4',
    headingFont:'-apple-system,BlinkMacSystemFont,sans-serif',
  },
  exciting: {
    bg:'#fff8f0', primary:'#FF6B35', accent:'#FF6B35',
    text:'#1a0a00', heading:'#cc3d00',
    heroGradient:'linear-gradient(135deg,#FF6B35 0%,#FFE134 100%)',
    heroText:'#fff', heroSub:'rgba(255,255,255,0.9)',
    outlineBtn:'border:2px solid rgba(255,255,255,0.8);color:#fff;background:transparent',
    navBg:'rgba(255,248,240,0.97)', navText:'#FF6B35',
    cardBg:'#fff', cardShadow:'0 4px 24px rgba(255,107,53,0.12)',
    sectionAlt:'#fff3e8', footerBg:'#1a0a00',
    inputBorder:'#ffd5b8', inputBg:'#fff',
    btn:'background:linear-gradient(135deg,#FF6B35,#FFE134);color:#1a0a00',
    trustBg:'#FF6B35',
    headingFont:'-apple-system,BlinkMacSystemFont,sans-serif',
  },
  elegant: {
    bg:'#1A1A1A', primary:'#C9A84C', accent:'#C9A84C',
    text:'#d4c9b8', heading:'#fff',
    heroGradient:'radial-gradient(ellipse at center,#2a2a2a 0%,#141414 100%)',
    heroText:'#fff', heroSub:'rgba(212,201,184,0.75)',
    outlineBtn:'border:1px solid #C9A84C;color:#C9A84C;background:transparent',
    navBg:'rgba(20,20,20,0.97)', navText:'#C9A84C',
    cardBg:'#242424', cardShadow:'0 4px 24px rgba(201,168,76,0.08)',
    sectionAlt:'#141414', footerBg:'#0a0a0a',
    inputBorder:'#3a3a3a', inputBg:'#242424',
    btn:'background:linear-gradient(135deg,#C9A84C,#e8d5a3);color:#1A1A1A',
    trustBg:'#C9A84C',
    headingFont:"Georgia,'Times New Roman',serif",
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

// ── Phase 1: Sonnet generates content JSON (fast, small output) ───────────────

async function generateContentJson({ businessName, businessType, city, state, businessDescription }) {
  const prompt = `Generate website content for this business as JSON. Output valid JSON only — no explanation, no markdown, no code fences.

Business: ${businessName}, a ${businessType} in ${city}, ${state}${businessDescription ? `. ${businessDescription}` : ''}.

Return exactly this JSON structure:
{
  "tagline": "compelling 6-10 word hero headline",
  "subheadline": "1-2 sentence value proposition for the hero",
  "about": "2-3 sentences about the business, its history and values",
  "services": [
    {"icon": "emoji", "name": "Service Name", "desc": "One sentence description"},
    {"icon": "emoji", "name": "Service Name", "desc": "One sentence description"},
    {"icon": "emoji", "name": "Service Name", "desc": "One sentence description"}
  ],
  "stats": ["10+ Years Experience", "500+ Happy Clients", "5★ Rated"],
  "cta": "Short action phrase e.g. Get a Free Quote"
}`

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].text.trim()
  console.log('[SF-SERVER] Phase 1 JSON:', raw.substring(0, 300))
  const match = raw.match(/\{[\s\S]*\}/)
  return JSON.parse(match ? match[0] : raw)
}

// ── Phase 2: Render content into hardcoded beautiful template ─────────────────

function buildPage(t, data, p) {
  const {
    businessName, phone, email, businessHours, address,
    facebook, instagram, photoBase64, photoMimeType, telDigits,
  } = p
  const { tagline, subheadline, about, services, stats, cta } = data
  const year = new Date().getFullYear()

  const photoHtml = photoBase64
    ? `<img src="data:${photoMimeType || 'image/jpeg'};base64,${photoBase64}" alt="${businessName}" style="width:100%;max-width:500px;border-radius:16px;display:block">`
    : ''

  const statsHtml = `<div style="display:flex;gap:20px;flex-wrap:wrap">
    ${stats.map(s => `<div style="flex:1;min-width:110px;text-align:center;background:${t.cardBg};border-radius:14px;padding:28px 16px;box-shadow:${t.cardShadow}">
      <div style="font-size:20px;font-weight:900;color:${t.accent};line-height:1.3">${s}</div>
    </div>`).join('')}
  </div>`

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${businessName}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:${t.bg};color:${t.text}">

<nav style="position:fixed;top:0;left:0;right:0;z-index:1000;background:${t.navBg};backdrop-filter:blur(12px);box-shadow:0 1px 20px rgba(0,0,0,0.08);padding:0 32px;display:flex;align-items:center;justify-content:space-between;height:68px">
  <span style="font-size:20px;font-weight:800;color:${t.navText};letter-spacing:-0.5px">${businessName}</span>
  ${phone ? `<a href="tel:${telDigits}" style="${t.btn};padding:10px 22px;border-radius:999px;font-weight:700;font-size:14px;text-decoration:none;display:inline-block">${phone}</a>` : ''}
</nav>

<section style="min-height:90vh;background:${t.heroGradient};display:flex;align-items:center;justify-content:center;text-align:center;padding:120px 24px 80px">
  <div style="max-width:840px;width:100%">
    <h1 style="font-family:${t.headingFont};font-size:clamp(38px,6vw,76px);font-weight:900;color:${t.heroText};margin:0 0 24px;line-height:1.08;letter-spacing:-1px">${tagline}</h1>
    <p style="font-size:clamp(17px,2vw,22px);color:${t.heroSub};margin:0 auto 44px;line-height:1.65;max-width:620px">${subheadline}</p>
    <div style="display:flex;gap:16px;justify-content:center;flex-wrap:wrap">
      <a href="#contact" style="${t.btn};padding:18px 36px;border-radius:10px;font-size:18px;font-weight:700;text-decoration:none;display:inline-block">${cta}</a>
      ${phone ? `<a href="tel:${telDigits}" style="${t.outlineBtn};padding:18px 36px;border-radius:10px;font-size:18px;font-weight:700;text-decoration:none;display:inline-block">📞 Call Now</a>` : ''}
    </div>
  </div>
</section>

<div style="background:${t.trustBg};padding:18px 24px">
  <div style="max-width:900px;margin:0 auto;display:flex;justify-content:center;gap:40px;flex-wrap:wrap">
    <span style="color:#fff;font-weight:600;font-size:14px">✓ Licensed &amp; Insured</span>
    <span style="color:#fff;font-weight:600;font-size:14px">⭐ 5-Star Rated</span>
    <span style="color:#fff;font-weight:600;font-size:14px">💰 Free Estimates</span>
  </div>
</div>

<section style="padding:96px 24px;background:${t.bg}">
  <div style="max-width:1100px;margin:0 auto;display:flex;gap:64px;align-items:center;flex-wrap:wrap">
    <div style="flex:1.2;min-width:280px">
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px">
        <div style="width:5px;height:52px;background:${t.accent};border-radius:3px;flex-shrink:0"></div>
        <h2 style="font-family:${t.headingFont};font-size:clamp(28px,3vw,42px);font-weight:800;color:${t.heading};margin:0">About Us</h2>
      </div>
      <p style="font-size:17px;line-height:1.85;color:${t.text};margin:0">${about}</p>
    </div>
    <div style="flex:1;min-width:260px">${photoBase64 ? photoHtml : statsHtml}</div>
  </div>
</section>

<section style="padding:96px 24px;background:${t.sectionAlt}">
  <div style="max-width:1100px;margin:0 auto">
    <h2 style="font-family:${t.headingFont};font-size:clamp(28px,3vw,42px);font-weight:800;color:${t.heading};text-align:center;margin:0 0 56px">Our Services</h2>
    <div style="display:flex;gap:28px;flex-wrap:wrap;justify-content:center">
      ${services.map(s => `<div style="background:${t.cardBg};border-radius:18px;padding:40px 32px;flex:1;min-width:240px;max-width:320px;box-shadow:${t.cardShadow};text-align:center">
        <div style="font-size:52px;margin-bottom:20px;line-height:1">${s.icon}</div>
        <h3 style="font-size:20px;font-weight:800;color:${t.heading};margin:0 0 14px">${s.name}</h3>
        <p style="color:${t.text};line-height:1.7;margin:0;font-size:15px">${s.desc}</p>
      </div>`).join('')}
    </div>
  </div>
</section>

<section id="contact" style="padding:96px 24px;background:${t.bg}">
  <div style="max-width:600px;margin:0 auto">
    <h2 style="font-family:${t.headingFont};font-size:clamp(28px,3vw,42px);font-weight:800;color:${t.heading};text-align:center;margin:0 0 12px">Get In Touch</h2>
    <p style="text-align:center;color:${t.text};margin:0 0 40px;font-size:17px;opacity:0.75">${businessHours ? 'Hours: ' + businessHours : "Fill out the form and we'll get back to you shortly."}</p>
    ${address ? `<p style="text-align:center;color:${t.text};margin:-20px 0 32px;font-size:14px;opacity:0.65">📍 ${address}</p>` : ''}
    <form id="contact-form">
      <input name="name" placeholder="Your Name" required style="width:100%;box-sizing:border-box;padding:15px 18px;border-radius:10px;border:2px solid ${t.inputBorder};font-size:16px;margin-bottom:16px;background:${t.inputBg};color:${t.text};display:block;font-family:inherit">
      <input name="phone" placeholder="Phone Number" style="width:100%;box-sizing:border-box;padding:15px 18px;border-radius:10px;border:2px solid ${t.inputBorder};font-size:16px;margin-bottom:16px;background:${t.inputBg};color:${t.text};display:block;font-family:inherit">
      <input name="email" type="email" placeholder="Email Address" style="width:100%;box-sizing:border-box;padding:15px 18px;border-radius:10px;border:2px solid ${t.inputBorder};font-size:16px;margin-bottom:16px;background:${t.inputBg};color:${t.text};display:block;font-family:inherit">
      <textarea name="message" placeholder="How can we help you?" rows="5" style="width:100%;box-sizing:border-box;padding:15px 18px;border-radius:10px;border:2px solid ${t.inputBorder};font-size:16px;margin-bottom:28px;background:${t.inputBg};color:${t.text};display:block;resize:vertical;font-family:inherit"></textarea>
      <button type="submit" style="${t.btn};width:100%;padding:20px;border-radius:10px;font-size:18px;font-weight:700;border:none;cursor:pointer;display:block;font-family:inherit">Send Message →</button>
    </form>
  </div>
</section>

<footer style="background:${t.footerBg};color:rgba(255,255,255,0.7);padding:60px 24px;text-align:center">
  <div style="max-width:800px;margin:0 auto">
    <div style="font-size:24px;font-weight:800;color:#fff;margin-bottom:20px">${businessName}</div>
    <div style="display:flex;justify-content:center;gap:28px;flex-wrap:wrap;margin-bottom:16px">
      ${phone ? `<a href="tel:${telDigits}" style="color:rgba(255,255,255,0.7);text-decoration:none">${phone}</a>` : ''}
      ${email ? `<a href="mailto:${email}" style="color:rgba(255,255,255,0.7);text-decoration:none">${email}</a>` : ''}
    </div>
    ${address ? `<div style="font-size:14px;margin-bottom:16px;opacity:0.55">📍 ${address}</div>` : ''}
    ${(facebook || instagram) ? `<div style="display:flex;justify-content:center;gap:20px;margin-bottom:20px">
      ${facebook ? `<a href="${facebook}" style="color:rgba(255,255,255,0.55);text-decoration:none;font-size:14px">Facebook</a>` : ''}
      ${instagram ? `<a href="${instagram}" style="color:rgba(255,255,255,0.55);text-decoration:none;font-size:14px">Instagram</a>` : ''}
    </div>` : ''}
    <div style="font-size:13px;opacity:0.35;border-top:1px solid rgba(255,255,255,0.08);padding-top:24px;margin-top:8px">&copy; ${year} ${businessName}. All rights reserved.</div>
  </div>
</footer>

${phone ? `<a href="tel:${telDigits}" style="position:fixed;bottom:28px;right:28px;${t.btn};padding:15px 26px;border-radius:999px;font-size:15px;font-weight:700;text-decoration:none;display:inline-block;box-shadow:0 6px 24px rgba(0,0,0,0.25);z-index:999">📞 Call Now</a>` : ''}

<script>
(function(){
  var f=document.getElementById('contact-form');
  if(!f)return;
  f.addEventListener('submit',function(e){
    e.preventDefault();
    f.innerHTML='<div style="padding:48px;text-align:center;font-size:20px;font-weight:700;">Thanks! We’ll be in touch soon. ✅<\/div>';
  });
}());
<\/script>
<\/body>
<\/html>`
}

// ── Website generation ────────────────────────────────────────────────────────

async function handleGenerateWebsite({
  businessName, businessType, city, state, businessDescription,
  themeVibe, phone, email, businessHours, address, facebook, instagram,
  photoBase64, photoMimeType,
}) {
  const t = THEMES[themeVibe] ?? THEMES.trustworthy
  const telDigits = phone ? phone.replace(/\D/g, '') : '5550000000'

  const data = await generateContentJson({ businessName, businessType, city, state, businessDescription })

  return buildPage(t, data, {
    businessName, businessType, city, state,
    phone, email, businessHours, address, facebook, instagram,
    photoBase64, photoMimeType, telDigits,
  })
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

  const raw = message.content[0].text.trim()
    .replace(/^```[\w]*\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  const docMatch = raw.match(/<!doctype\s+html[\s\S]*<\/html>/i)
  return docMatch ? docMatch[0] : raw
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
