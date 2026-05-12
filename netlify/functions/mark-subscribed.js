import { createClient } from '@supabase/supabase-js'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS }
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' }

  const token = event.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'No auth token' }) }
  }

  try {
    // Use service role client for both token validation and the upsert
    const adminClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )
    const { data: { user }, error: authError } = await adminClient.auth.getUser(token)
    if (authError || !user) {
      return { statusCode: 401, headers: CORS, body: JSON.stringify({ error: 'Invalid token' }) }
    }

    const { error } = await adminClient.from('user_profiles').upsert({
      id: user.id,
      is_subscribed: true,
    })

    if (error) {
      console.error('mark-subscribed: upsert error', error)
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: error.message }) }
    }

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ success: true }) }
  } catch (err) {
    console.error('mark-subscribed: threw', err)
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) }
  }
}
