import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const NETLIFY_API = 'https://api.netlify.com/api/v1'

async function netlifyFetch(path, options = {}, token) {
  const res = await fetch(`${NETLIFY_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Netlify API ${path} failed (${res.status}): ${body}`)
  }
  return res.json()
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }

  const token = process.env.NETLIFY_ACCESS_TOKEN
  if (!token) {
    return {
      statusCode: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'NETLIFY_ACCESS_TOKEN not configured' }),
    }
  }

  try {
    const { siteHtml, businessName, userId } = JSON.parse(event.body)

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    // Look up existing Netlify site for this user
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('netlify_site_id, site_url')
      .eq('id', userId)
      .single()

    let siteId = profile?.netlify_site_id
    let siteUrl = profile?.site_url

    if (!siteId) {
      // Derive a unique, stable site name from userId
      const slug = businessName
        ? businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28)
        : 'site'
      const shortId = userId.replace(/-/g, '').slice(0, 10)
      const siteName = `sf-${slug}-${shortId}`

      const site = await netlifyFetch('/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: siteName }),
      }, token)

      siteId = site.id
      siteUrl = site.ssl_url || `https://${siteName}.netlify.app`
    }

    // File digest deploy: compute SHA1 of the HTML
    const htmlBytes = Buffer.from(siteHtml, 'utf-8')
    const sha1 = crypto.createHash('sha1').update(htmlBytes).digest('hex')

    // Start the deploy
    const deploy = await netlifyFetch(`/sites/${siteId}/deploys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: { '/index.html': sha1 } }),
    }, token)

    // Upload the file if Netlify doesn't have it cached
    if (deploy.required?.includes(sha1)) {
      await fetch(`${NETLIFY_API}/deploys/${deploy.id}/files/index.html`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/octet-stream',
        },
        body: htmlBytes,
      })
    }

    // Persist site_url and netlify_site_id to the user's profile
    await supabase.from('user_profiles').upsert({
      id: userId,
      site_url: siteUrl,
      netlify_site_id: siteId,
      updated_at: new Date().toISOString(),
    })

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: siteUrl }),
    }
  } catch (err) {
    console.error('deploy-site error:', err)
    return {
      statusCode: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message }),
    }
  }
}
