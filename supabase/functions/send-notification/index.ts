// Supabase Edge Function for sending web push notifications
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { userId, title, body, data } = await req.json()

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
    }

    // 2. Get user's web push subscription
    const { data: profile } = await supabase
      .from('profiles')
      .select('web_push_subscription, push_token')
      .eq('id', userId)
      .single()

    // 3. Send web push notification if subscription exists
    if (profile?.web_push_subscription) {
      try {
        // Use web-push library (you'll need to add this to import map)
        const webpush = await import('https://esm.sh/web-push@3.6.3')
        
        const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')!
        const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')!
        const vapidSubject = Deno.env.get('VAPID_SUBJECT')!

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

        await webpush.sendNotification(profile.web_push_subscription, payload)
        console.log('Web push sent successfully')
      } catch (pushError) {
        console.error('Web push failed:', pushError)
      }
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
          console.log('Expo push sent successfully')
        }
      } catch (expoError) {
        console.error('Expo push failed:', expoError)
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
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
