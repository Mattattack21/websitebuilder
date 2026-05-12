import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const sig = event.headers['stripe-signature']

  let stripeEvent
  try {
    // event.body must be the raw string — do NOT JSON.parse before this call
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message)
    return { statusCode: 400, body: `Webhook Error: ${err.message}` }
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY  // bypasses RLS for trusted server writes
  )

  try {
    switch (stripeEvent.type) {
      case 'checkout.session.completed': {
        const session = stripeEvent.data.object
        const userId = session.client_reference_id
        if (userId) {
          await supabase.from('user_profiles').upsert({
            id: userId,
            is_subscribed: true,
            stripe_customer_id: session.customer,
          })
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = stripeEvent.data.object
        await supabase
          .from('user_profiles')
          .update({ is_subscribed: false })
          .eq('stripe_customer_id', subscription.customer)
        break
      }

      case 'invoice.payment_failed': {
        // Future: email the user that their payment failed
        console.log('Payment failed for customer:', stripeEvent.data.object.customer)
        break
      }
    }
  } catch (err) {
    console.error('Supabase update error:', err)
    // Still return 200 so Stripe doesn't keep retrying for DB errors
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ received: true }),
  }
}
