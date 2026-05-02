import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '../utils/supabase'

const client = new Anthropic({
  apiKey: import.meta.env.VITE_CLAUDE_API_KEY,
  dangerouslyAllowBrowser: true,
})

const THEME_GUIDES = {
  trustworthy: {
    label: 'Trustworthy',
    css: `
Color palette: primary #1e3a5f (navy), accent #2563eb (blue), background #ffffff, text #1e293b, headings #0f172a.
Font: system-ui, -apple-system, sans-serif. Clean, readable, and professional.
Style: generous whitespace, subtle #e2e8f0 borders, soft box-shadows (0 2px 8px rgba(0,0,0,0.08)), rounded corners 8px.
Tone: professional and reassuring. Use words like "trusted", "reliable", "certified", "expert", "professional".`,
  },
  bold: {
    label: 'Bold',
    css: `
Color palette: background #0a0a0a, primary #ef4444 (red), accent #ffffff, text #f5f5f5, headings #ffffff.
Font: system-ui with heavy weights (800–900) for headings; clean sans-serif for body.
Style: high contrast, large impactful typography, red CTA buttons, minimal decoration, strong borders on cards.
Tone: confident and direct. Use words like "results", "powerful", "fast", "dominate", "get it done now".`,
  },
  warm: {
    label: 'Cute & Warm',
    css: `
Color palette: primary #ec4899 (pink), accent #f9a8d4 (light pink), background #fff0f6 (soft cream/pink), text #831843 (dark pink), headings #500724.
Font: system-ui; rounded corners (16–24px) everywhere — buttons, cards, inputs.
Style: soft pastel shadows, playful rounded shapes, heart or star emoji accents, friendly feel.
Tone: warm and personal. Use words like "friendly", "caring", "personal", "we love what we do", "here for you".`,
  },
  exciting: {
    label: 'Exciting',
    css: `
Color palette: primary #f97316 (orange), accent #facc15 (yellow), background #fff7ed, text #431407, headings #9a3412.
Hero background: use a bold linear-gradient(135deg, #f97316 0%, #facc15 100%).
Font: system-ui, bold weights 700–900. Dynamic, energetic layout.
Style: vibrant gradient sections, rounded cards, bold CTAs with gradient backgrounds, emoji accents.
Tone: enthusiastic and fun. Use words like "amazing", "exciting", "let's go", "we can't wait to help you".`,
  },
  elegant: {
    label: 'Elegant',
    css: `
Color palette: background #0c0c0c, primary #d4af37 (gold), accent #f5e6a3 (light gold), text #e5e0d8, headings #ffffff.
Font: Georgia, 'Times New Roman', serif for headings; system-ui for body.
Style: fine 1px gold borders, generous padding, luxury feel, uppercase letter-spacing (2–3px) on section labels.
Tone: refined and exclusive. Use words like "premium", "bespoke", "distinguished", "artisan", "curated".`,
  },
}

// ── Lead capture script injector ─────────────────────────────────────────────
// Injected after Claude generates the HTML so we never depend on Claude copying
// exact JavaScript. Works for both fresh generations and content updates.
function injectLeadScript(html, userId) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL  ?? ''
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

  // Remove any previously injected script to prevent duplicates after updates
  html = html.replace(/<script[^>]*data-sf-lead[^>]*>[\s\S]*?<\/script>\s*/gi, '')

  const script = userId
    ? `<script data-sf-lead="1">
(function () {
  var f = document.getElementById('contact-form');
  if (!f) return;
  f.addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = f.querySelector('button[type="submit"]');
    var orig = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    try {
      var r = await fetch('${supabaseUrl}/rest/v1/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': '${supabaseKey}',
          'Authorization': 'Bearer ${supabaseKey}',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          user_id: '${userId}',
          name:    (f.querySelector('[name="name"]')    || {}).value || '',
          phone:   (f.querySelector('[name="phone"]')   || {}).value || '',
          email:   (f.querySelector('[name="email"]')   || {}).value || '',
          message: (f.querySelector('[name="message"]') || {}).value || ''
        })
      });
      if (r.ok) {
        f.innerHTML = "<div style='padding:40px;text-align:center;font-size:20px;font-weight:600;color:inherit;'>Thanks! We'll be in touch soon. ✅</div>";
      } else {
        if (btn) { btn.disabled = false; btn.textContent = orig; }
        var p = f.querySelector('.sf-err');
        if (!p) {
          p = document.createElement('p');
          p.className = 'sf-err';
          p.style.cssText = 'color:#ef4444;margin-top:8px;font-size:14px;text-align:center;';
          f.appendChild(p);
        }
        p.textContent = 'Something went wrong. Please try again.';
      }
    } catch (_) {
      if (btn) { btn.disabled = false; btn.textContent = orig; }
    }
  });
}());
</script>`
    : `<script data-sf-lead="1">
(function () {
  var f = document.getElementById('contact-form');
  if (!f) return;
  f.addEventListener('submit', function (e) {
    e.preventDefault();
    f.innerHTML = "<div style='padding:40px;text-align:center;font-size:20px;font-weight:600;'>Thanks! We'll be in touch soon. ✅</div>";
  });
}());
</script>`

  return html.includes('</body>')
    ? html.replace('</body>', script + '\n</body>')
    : html + script
}

// ── Full website generation ───────────────────────────────────────────────────
export async function generateWebsite(
  {
    businessName, businessType, city, state, businessDescription,
    themeVibe,
    phone, email, businessHours, address, facebook, instagram,
    photoBase64, photoMimeType,
  },
  user,
  onProgress
) {
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

  const prompt = `You are an expert web designer. Build a complete, polished, single-page business website as raw HTML with ALL CSS embedded in a <style> tag. No external files, no CDN links, no frameworks.

BUSINESS INFORMATION:
- Name: ${businessName}
- Type: ${businessType}
- Location: ${city}, ${state}
${businessDescription ? `- About: ${businessDescription}` : ''}
${contactBlock}

DESIGN THEME — "${theme.label}":
${theme.css}

REQUIRED SECTIONS (in this exact order):
1. STICKY NAV — business name/logo left; phone number as click-to-call link right (if provided).
2. HERO — bold headline with the business name, a compelling AI-written tagline, a primary CTA button ("Get a Free Quote" or similar), and a prominent "📞 Call Us Today" click-to-call button linking to tel:${telDigits}.
3. ABOUT US — 2–3 sentences of warm, trust-building copy tailored to this specific business.
4. SERVICES — exactly 3–4 service cards, each with a relevant emoji icon, a title, and a 1-sentence description. Choose services realistic for a ${businessType}.
5. CONTACT & INFO — lead capture form. The form element MUST have id="contact-form". Each field MUST use these exact name attributes: name="name" (text input), name="phone" (tel input), name="email" (email input), name="message" (textarea). Include a submit button.${businessHours ? ` Show hours: ${businessHours}.` : ''}${address ? ` Show address: ${address}.` : ''}
6. FOOTER — business name, phone, email (if provided), address (if provided), social links (if provided), copyright line.
7. FIXED BOTTOM BAR — a sticky "📞 Call Us Now" bar always visible at the bottom of the screen on mobile, linking to tel:${telDigits}.${photoBase64 ? `\n8. BUSINESS PHOTO — add the provided photo in the hero or about section using exactly src="__BUSINESS_PHOTO__", styled naturally within the design.` : ''}

TECHNICAL RULES:
1. Output ONLY the raw HTML — no markdown, no \`\`\` fences, no commentary before or after.
2. ALL CSS must be inside a single <style> tag in <head>. Zero external stylesheets or CDN links.
3. No external JavaScript libraries (jQuery, frameworks). Minimal vanilla JS only for UI interactions like a mobile nav toggle.
4. Mobile-first responsive design. Must look great at 375px wide. Use media queries for desktop.
5. Start the output with <!DOCTYPE html> and end with </html>. Nothing outside the HTML document.
6. The design must look polished and intentional — apply the theme deeply through colors, typography, spacing, and copy. Not a generic template.
7. Write compelling, realistic copy tailored to this business's name, type, and location.`

  const messageContent = [{ type: 'text', text: prompt }]
  if (photoBase64) {
    messageContent.push({
      type: 'image',
      source: { type: 'base64', media_type: photoMimeType || 'image/jpeg', data: photoBase64 },
    })
  }

  let accumulated = ''
  const ESTIMATED_LENGTH = 9000

  const stream = await client.messages.stream({
    model: 'claude-opus-4-7',
    max_tokens: 8192,
    messages: [{ role: 'user', content: messageContent }],
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      accumulated += event.delta.text
      onProgress(Math.min(Math.floor((accumulated.length / ESTIMATED_LENGTH) * 85), 85))
    }
  }

  onProgress(100)

  let html = accumulated
    .replace(/^```html\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()

  if (photoBase64) {
    html = html.replace(
      'src="__BUSINESS_PHOTO__"',
      `src="data:${photoMimeType || 'image/jpeg'};base64,${photoBase64}"`
    )
  }

  html = injectLeadScript(html, user?.id ?? null)

  if (user) {
    try {
      await supabase.from('user_profiles').upsert({
        id: user.id,
        site_html: html,
        updated_at: new Date().toISOString(),
      })
    } catch {
      // Non-blocking — return the HTML even if Supabase save fails
    }
  }

  return html
}

// ── Content update (natural language) ────────────────────────────────────────
export async function updateWebsite({ currentHtml, request }, user, onProgress) {
  const prompt = `You are editing an existing business website. Apply the user's requested change and return the full updated HTML.

User's request: "${request}"

Current website HTML:
${currentHtml}

Requirements:
1. Apply the requested change. Keep everything else exactly the same.
2. Output ONLY the complete updated HTML — no markdown, no code fences, no explanation.
3. Start with <!DOCTYPE html> and end with </html>.`

  let accumulated = ''
  const ESTIMATED_LENGTH = 9000

  const stream = await client.messages.stream({
    model: 'claude-opus-4-7',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }],
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      accumulated += event.delta.text
      onProgress(Math.min(Math.floor((accumulated.length / ESTIMATED_LENGTH) * 85), 85))
    }
  }

  onProgress(100)

  let html = accumulated
    .replace(/^```html\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()

  // Re-inject lead script — Claude may rewrite the contact section
  html = injectLeadScript(html, user?.id ?? null)

  if (user) {
    try {
      await supabase.from('user_profiles').upsert({
        id: user.id,
        site_html: html,
        updated_at: new Date().toISOString(),
      })
    } catch {
      // Non-blocking
    }
  }

  return html
}

// ── Patch existing HTML with new contact details ──────────────────────────────
export async function finalizeWebsite(
  { currentHtml, phone, displayEmail, hours, address, facebookUrl, instagramUrl, photoBase64, photoMimeType },
  onProgress
) {
  const updates = []
  if (phone) updates.push(`- Replace ALL placeholder phone numbers with: ${phone}. Add a click-to-call link <a href="tel:${phone.replace(/\D/g, '')}"> wherever phone numbers appear.`)
  if (displayEmail) updates.push(`- Add the contact email "${displayEmail}" to the contact section and footer.`)
  if (hours) updates.push(`- Add business hours "${hours}" — show this clearly in the contact section and/or footer.`)
  if (address) updates.push(`- Add this address/service area: "${address}" — show in the contact section and footer.`)
  if (facebookUrl) updates.push(`- Replace any placeholder Facebook URL with "${facebookUrl}" — place in the nav social icons and/or footer.`)
  if (instagramUrl) updates.push(`- Replace any placeholder Instagram URL with "${instagramUrl}" — place in the nav social icons and/or footer.`)
  if (photoBase64) updates.push(`- Add the provided business photo to the hero or about section as <img src="__BUSINESS_PHOTO__" alt="Our business"> — style it naturally within the existing design.`)

  if (updates.length === 0) {
    onProgress(100)
    return currentHtml
  }

  const prompt = `You are finalizing a business website by replacing placeholders with real business information.

Apply ONLY the following updates and return the complete updated HTML:
${updates.join('\n')}

Rules:
1. Apply ONLY the listed updates. Keep all other content, design, colors, fonts, and layout exactly the same.
2. If adding a photo, use exactly src="__BUSINESS_PHOTO__" as the image src attribute.
3. Output ONLY the complete updated HTML — no markdown, no code fences, no explanation.
4. Start with <!DOCTYPE html> and end with </html>.

Current website HTML:
${currentHtml}`

  const messageContent = [{ type: 'text', text: prompt }]
  if (photoBase64) {
    messageContent.push({
      type: 'image',
      source: { type: 'base64', media_type: photoMimeType || 'image/jpeg', data: photoBase64 },
    })
  }

  let accumulated = ''
  const ESTIMATED_LENGTH = 9000

  const stream = await client.messages.stream({
    model: 'claude-opus-4-7',
    max_tokens: 8192,
    messages: [{ role: 'user', content: messageContent }],
  })

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      accumulated += event.delta.text
      onProgress(Math.min(Math.floor((accumulated.length / ESTIMATED_LENGTH) * 85), 85))
    }
  }

  onProgress(100)

  let html = accumulated
    .replace(/^```html\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()

  if (photoBase64) {
    html = html.replace(
      'src="__BUSINESS_PHOTO__"',
      `src="data:${photoMimeType || 'image/jpeg'};base64,${photoBase64}"`
    )
  }

  return html
}

// ── Help / support chat ───────────────────────────────────────────────────────
export async function askSupportQuestion(question, onChunk) {
  const stream = await client.messages.stream({
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

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      onChunk(event.delta.text)
    }
  }
}
