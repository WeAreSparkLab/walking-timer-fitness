// Supabase Edge Function for sending web push notifications
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

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
