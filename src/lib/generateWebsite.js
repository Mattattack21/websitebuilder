import { supabase } from '../utils/supabase'

// ── Lead capture script injector ─────────────────────────────────────────────
// Runs client-side so it can embed the public Supabase URL/anon key into the
// static HTML that gets stored and eventually served as the customer's website.
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

// ── Shared fetch helper ───────────────────────────────────────────────────────
async function callGenerate(payload) {
  console.log('[SF] callGenerate start, type:', payload.type)
  const res = await fetch('/.netlify/functions/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  console.log('[SF] fetch response status:', res.status, res.ok)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    console.error('[SF] fetch error body:', data)
    throw new Error(data.error ?? 'Generation failed')
  }
  const json = await res.json()
  console.log('[SF] response html length:', json.html?.length ?? 0)
  console.log('[SF] html tail:', json.html?.slice(-80) ?? 'NULL')
  return json
}

// ── Full website generation ───────────────────────────────────────────────────
export async function generateWebsite(params, user, onProgress, onRetry) {
  onProgress?.(5)

  let fakeProgress = 5
  const ticker = setInterval(() => {
    fakeProgress = Math.min(fakeProgress + 2, 60)
    onProgress?.(fakeProgress)
  }, 600)

  async function attempt() {
    const { html: rawHtml } = await callGenerate({ type: 'website', ...params })
    return rawHtml
  }

  try {
    let rawHtml
    try {
      rawHtml = await attempt()
    } catch (firstErr) {
      console.warn('[SF] First attempt failed, retrying. Error:', firstErr?.message)
      onRetry?.()
      fakeProgress = 5
      onProgress?.(5)
      rawHtml = await attempt()
    }

    clearInterval(ticker)

    console.log('[SF] style tags in HTML:', (rawHtml.match(/<style/g)||[]).length)
    console.log('[SF] style content length:', rawHtml.match(/<style>([\s\S]*?)<\/style>/)?.[1]?.length ?? 0)

    const html = injectLeadScript(rawHtml, user?.id ?? null)

    if (user) {
      try {
        await supabase.from('user_profiles').upsert({
          id: user.id,
          site_html: html,
          updated_at: new Date().toISOString(),
        })
      } catch { /* non-blocking */ }
    }

    onProgress?.(100)
    return html
  } catch (err) {
    clearInterval(ticker)
    throw err
  }
}

// ── Content update (natural language) ────────────────────────────────────────
export async function updateWebsite({ currentHtml, request }, user, onProgress) {
  onProgress?.(5)

  let fakeProgress = 5
  const ticker = setInterval(() => {
    fakeProgress = Math.min(fakeProgress + 3, 82)
    onProgress?.(fakeProgress)
  }, 600)

  try {
    const { html: rawHtml } = await callGenerate({ type: 'update', currentHtml, request })
    clearInterval(ticker)
    onProgress?.(90)

    const html = injectLeadScript(rawHtml, user?.id ?? null)

    if (user) {
      try {
        await supabase.from('user_profiles').upsert({
          id: user.id,
          site_html: html,
          updated_at: new Date().toISOString(),
        })
      } catch { /* non-blocking */ }
    }

    onProgress?.(100)
    return html
  } catch (err) {
    clearInterval(ticker)
    throw err
  }
}

// ── Help / support chat ───────────────────────────────────────────────────────
// Delivers the full answer at once (server-side generation can't stream to client)
export async function askSupportQuestion(question, onChunk) {
  const { answer } = await callGenerate({ type: 'support', question })
  onChunk(answer)
}
