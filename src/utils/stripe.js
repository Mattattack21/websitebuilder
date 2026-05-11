export async function redirectToPortal(customerId) {
  const res = await fetch('/.netlify/functions/create-portal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ customerId, returnUrl: window.location.origin + '/dashboard' }),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? 'Failed to open billing portal')
  }

  const { url } = await res.json()
  window.location.href = url
}

export async function redirectToCheckout(userId, email) {
  const res = await fetch('/.netlify/functions/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, email }),
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error ?? 'Failed to create checkout session')
  }

  const { url } = await res.json()
  window.location.href = url
}
