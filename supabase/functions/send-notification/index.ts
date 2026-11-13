// Supabase Edge Function for sending web push notifications
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

/**
 * Obtain a short-lived Google OAuth2 access token for the FCM v1 API
 * by constructing and signing a JWT with the service account's private key.
 */
async function getFCMAccessToken(serviceAccount: {
  client_email: string
  private_key: string
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = { alg: 'RS256', typ: 'JWT' }
  const claimSet = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  }

  const encode = (obj: object) =>
    btoa(JSON.stringify(obj)).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const signingInput = `${encode(header)}.${encode(claimSet)}`

  const keyPem = serviceAccount.private_key
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\n/g, '')

  const keyBytes = Uint8Array.from(atob(keyPem), (c) => c.charCodeAt(0))
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBytes,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const sigBytes = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(signingInput)
  )

  const signature = btoa(String.fromCharCode(...new Uint8Array(sigBytes)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

  const jwt = `${signingInput}.${signature}`

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  })

  const tokenData = await tokenRes.json()
  if (!tokenData.access_token) {
    throw new Error(`Failed to get FCM access token: ${JSON.stringify(tokenData)}`)
  }
  return tokenData.access_token
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userId, title, body, data } = await req.json()
    
    console.log('🔔 Edge Function called:', { userId, title, body })
    console.log('🆔 Querying profiles for user ID:', userId)

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 1. Create in-app notification
    const { error: notifError } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type: data?.type || 'notification',
        title: title,
        message: body,
        data: data,
      })

    if (notifError) {
      console.error('Failed to create notification:', notifError)
    } else {
      console.log('✅ In-app notification created')
    }

    // 2. Get user's web push subscription
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    console.log('👤 RAW PROFILE:', JSON.stringify(profile))
    console.log('👤 PROFILE ERROR:', profileError)
    console.log('👤 PROFILE KEYS:', profile ? Object.keys(profile) : 'no profile')
    console.log('👤 WEB_PUSH_SUBSCRIPTION:', profile?.web_push_subscription)
    console.log('👤 HAS WEB PUSH:', !!profile?.web_push_subscription)

    // 3. Send web push notification if subscription exists
    let webPushSuccess = false;
    if (profile?.web_push_subscription) {
      try {
        const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
        const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
        const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:support@wearesparklab.com'

        console.log('🔐 VAPID keys configured:', {
          hasPublicKey: !!vapidPublicKey,
          hasPrivateKey: !!vapidPrivateKey,
          subject: vapidSubject,
        })

        if (!vapidPublicKey || !vapidPrivateKey) {
          console.error('❌ VAPID keys not configured!')
          return new Response(
            JSON.stringify({ success: false, error: 'VAPID keys not configured' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Set VAPID details
        webpush.setVapidDetails(
          vapidSubject,
          vapidPublicKey,
          vapidPrivateKey
        )

        const payload = JSON.stringify({
          title,
          body,
          icon: '/icon-192.png',
          badge: '/icon-192.png',
          data,
        })

        console.log('📤 Sending web push...')
        console.log('📍 Endpoint:', profile.web_push_subscription.endpoint?.substring(0, 80))
        console.log('📦 Payload:', payload.substring(0, 200))
        
        const result = await webpush.sendNotification(profile.web_push_subscription, payload)
        console.log('✅ Web push sent successfully!', result)
        webPushSuccess = true;
      } catch (pushError: any) {
        console.error('❌ Web push failed:', pushError.message || pushError)
        console.error('❌ Error stack:', pushError.stack)
        console.error('❌ Error body:', pushError.body)
        console.error('❌ Status code:', pushError.statusCode)
      }
    } else {
      console.log('⚠️ No web push subscription found for user')
    }

    // 4. Send Expo push notification if token exists
    if (profile?.push_token) {
      try {
        const message = {
          to: profile.push_token,
          title,
          body,
          data,
          sound: 'default',
        }

        const response = await fetch('https://exp.host/--/api/v2/push/send', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(message),
        })

        if (!response.ok) {
          console.error('Expo push failed:', await response.text())
        } else {
          console.log('✅ Expo push sent successfully')
        }
      } catch (expoError) {
        console.error('Expo push failed:', expoError)
      }
    }

    // 5. Send FCM push notification (HTTP v1 API) to all web browser tokens for this user
    const fcmServiceAccountRaw = Deno.env.get('FCM_SERVICE_ACCOUNT_KEY')
    if (fcmServiceAccountRaw) {
      const { data: fcmRows, error: fcmError } = await supabase
        .from('fcm_tokens')
        .select('token')
        .eq('user_id', userId)

      if (fcmError) {
        console.error('Failed to fetch FCM tokens:', fcmError)
      } else if (fcmRows && fcmRows.length > 0) {
        const tokens = fcmRows.map((r: { token: string }) => r.token)
        console.log(`📲 Sending FCM v1 to ${tokens.length} token(s)`)

        try {
          const serviceAccount = JSON.parse(fcmServiceAccountRaw)
          const accessToken = await getFCMAccessToken(serviceAccount)
          const projectId: string = serviceAccount.project_id

          for (const token of tokens) {
            try {
              const fcmResponse = await fetch(
                `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
                {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    message: {
                      token,
                      notification: { title, body },
                      webpush: {
                        notification: {
                          title,
                          body,
                          icon: '/icon-192.png',
                          badge: '/icon-192.png',
                          requireInteraction: false,
                        },
                        fcm_options: { link: '/' },
                      },
                      // FCM data values must all be strings
                      data: Object.fromEntries(
                        Object.entries(data || {}).map(([k, v]) => [k, String(v)])
                      ),
                    },
                  }),
                }
              )

              if (!fcmResponse.ok) {
                const errText = await fcmResponse.text()
                if (fcmResponse.status === 404 || fcmResponse.status === 410) {
                  console.error('❌ Stale FCM token, removing:', token.substring(0, 20))
                  await supabase.from('fcm_tokens').delete().eq('token', token)
                } else {
                  console.error('❌ FCM v1 send error:', fcmResponse.status, errText)
                }
              } else {
                console.log('✅ FCM v1 sent to token:', token.substring(0, 20))
              }
            } catch (fcmSendError) {
              console.error('❌ FCM send error for token:', fcmSendError)
            }
          }
        } catch (parseError) {
          console.error('❌ Failed to parse FCM_SERVICE_ACCOUNT_KEY:', parseError)
        }
      } else {
        console.log('ℹ️ No FCM tokens found for user')
      }
    } else {
      console.log('ℹ️ FCM_SERVICE_ACCOUNT_KEY not configured - skipping FCM delivery')
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        webPushSent: true,
        inAppCreated: !notifError,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error: any) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
