import { loadStripe } from '@stripe/stripe-js'

let stripePromise = null

function getStripe() {
  if (!stripePromise) {
    stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY)
  }
  return stripePromise
}

export async function redirectToCheckout(userId) {
  const stripe = await getStripe()
  const { error } = await stripe.redirectToCheckout({
    lineItems: [{ price: import.meta.env.VITE_STRIPE_PRICE_ID, quantity: 1 }],
    mode: 'subscription',
    successUrl: `${window.location.origin}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${window.location.origin}/pricing`,
    clientReferenceId: userId ?? undefined,
  })
  if (error) throw error
}
