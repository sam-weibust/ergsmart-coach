import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.79.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, code, state, refresh_token } = await req.json();
    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '');

    if (!authHeader) {
      throw new Error('Authorization header required');
    }

    // Verify the user token
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader);
    if (authError || !user) {
      throw new Error('Invalid user token');
    }

    const C2_CLIENT_ID = Deno.env.get("C2_CLIENT_ID");
    const C2_CLIENT_SECRET = Deno.env.get("C2_CLIENT_SECRET");
    const C2_REDIRECT_URI = `${Deno.env.get("SUPABASE_URL")}/functions/v1/c2-logbook-auth`;

    if (!C2_CLIENT_ID || !C2_CLIENT_SECRET) {
      throw new Error('C2 API credentials not configured');
    }

    if (action === 'get_auth_url') {
      const authUrl = `https://log.concept2.com/oauth/authorize?` +
        `client_id=${C2_CLIENT_ID}&` +
        `redirect_uri=${encodeURIComponent(C2_REDIRECT_URI)}&` +
        `response_type=code&` +
        `scope=user:read,results:read&` +
        `state=${user.id}`;

      return new Response(JSON.stringify({ auth_url: authUrl }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === 'exchange_code') {
      // Exchange authorization code for access token
      const tokenResponse = await fetch('https://log.concept2.com/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: C2_CLIENT_ID,
          client_secret: C2_CLIENT_SECRET,
          redirect_uri: C2_REDIRECT_URI,
          code: code,
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to exchange authorization code');
      }

      const tokenData = await tokenResponse.json();

      // Get user info from C2
      const userResponse = await fetch('https://log.concept2.com/api/users/me', {
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
        },
      });

      if (!userResponse.ok) {
        throw new Error('Failed to get C2 user info');
      }

      const c2User = await userResponse.json();

      // Store the connection
      const { error } = await supabase
        .from('c2_connections')
        .upsert({
          user_id: user.id,
          c2_user_id: c2User.id.toString(),
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
          last_sync_at: new Date().toISOString(),
        });

      if (error) {
        throw new Error(`Failed to store connection: ${error.message}`);
      }

      return new Response(JSON.stringify({ 
        success: true, 
        c2_user: c2User 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === 'refresh_token') {
      // Refresh access token
      const tokenResponse = await fetch('https://log.concept2.com/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: C2_CLIENT_ID,
          client_secret: C2_CLIENT_SECRET,
          refresh_token: refresh_token,
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to refresh token');
      }

      const tokenData = await tokenResponse.json();

      // Update the connection
      const { error } = await supabase
        .from('c2_connections')
        .update({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token || refresh_token,
          token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
        })
        .eq('user_id', user.id);

      if (error) {
        throw new Error(`Failed to update connection: ${error.message}`);
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error('Invalid action');

  } catch (error) {
    console.error('C2 auth error:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});