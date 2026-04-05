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

const C2_CLIENT_ID = Deno.env.get("C2_CLIENT_ID");
const C2_CLIENT_SECRET = Deno.env.get("C2_CLIENT_SECRET");

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const C2_REDIRECT_URI = `${Deno.env.get("SUPABASE_URL")}/functions/v1/c2-logbook-auth`;

  // ── GET handler: OAuth redirect callback from Concept2 ──
  if (req.method === 'GET') {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state"); // user UUID
    const errorParam = url.searchParams.get("error");

    if (errorParam || !code || !state) {
      const errMsg = errorParam || "Missing code or state";
      return new Response(
        `<html><body><script>window.opener?.postMessage({type:"c2_auth_error",error:${JSON.stringify(errMsg)}},"*");window.close();</script><p>Auth failed. You can close this window.</p></body></html>`,
        { headers: { "Content-Type": "text/html" }, status: 200 }
      );
    }

    try {
      if (!C2_CLIENT_ID || !C2_CLIENT_SECRET) {
        throw new Error("C2 API credentials not configured");
      }

      // Exchange code for tokens
      const tokenResponse = await fetch('https://log.concept2.com/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: C2_CLIENT_ID,
          client_secret: C2_CLIENT_SECRET,
          redirect_uri: C2_REDIRECT_URI,
          code,
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to exchange authorization code');
      }

      const tokenData = await tokenResponse.json();

      // Get C2 user info
      const userResponse = await fetch('https://log.concept2.com/api/users/me', {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
      });

      if (!userResponse.ok) {
        throw new Error('Failed to get C2 user info');
      }

      const c2User = await userResponse.json();

      // Upsert connection
      const { error } = await supabase
        .from('c2_connections')
        .upsert({
          user_id: state,
          c2_user_id: c2User.id.toString(),
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_expires_at: new Date(Date.now() + tokenData.expires_in * 1000).toISOString(),
          last_sync_at: new Date().toISOString(),
        });

      if (error) {
        throw new Error(`Failed to store connection: ${error.message}`);
      }

      return new Response(
        `<html><body><script>window.opener?.postMessage({type:"c2_auth_success"},"*");window.close();</script><p>Connected! You can close this window.</p></body></html>`,
        { headers: { "Content-Type": "text/html" }, status: 200 }
      );
    } catch (error) {
      console.error('C2 GET auth error:', error);
      const errMsg = error.message || 'Unknown error';
      return new Response(
        `<html><body><script>window.opener?.postMessage({type:"c2_auth_error",error:${JSON.stringify(errMsg)}},"*");window.close();</script><p>Auth failed. You can close this window.</p></body></html>`,
        { headers: { "Content-Type": "text/html" }, status: 200 }
      );
    }
  }

  // ── POST handler: existing actions ──
  try {
    const { action, code, state, refresh_token } = await req.json();
    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '');

    if (!authHeader) {
      throw new Error('Authorization header required');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader);
    if (authError || !user) {
      throw new Error('Invalid user token');
    }

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
      const tokenResponse = await fetch('https://log.concept2.com/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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

      const userResponse = await fetch('https://log.concept2.com/api/users/me', {
        headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
      });

      if (!userResponse.ok) {
        throw new Error('Failed to get C2 user info');
      }

      const c2User = await userResponse.json();

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

      return new Response(JSON.stringify({ success: true, c2_user: c2User }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === 'refresh_token') {
      const tokenResponse = await fetch('https://log.concept2.com/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
