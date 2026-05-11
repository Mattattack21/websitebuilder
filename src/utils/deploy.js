export async function deployWebsite(siteHtml, userId, businessName) {
  const res = await fetch('/.netlify/functions/deploy-site', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ siteHtml, userId, businessName }),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? 'Deploy failed')
  }

  const { url } = await res.json()
  return url
}
