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

// Convert C2 workout to our format
function mapC2Workout(c2Workout: any) {
  const workout = {
    workout_type: determineWorkoutType(c2Workout),
    distance: c2Workout.distance || null,
    duration: formatDuration(c2Workout.time),
    avg_split: formatSplit(c2Workout.stroke_rate ? c2Workout.time_formatted : null, c2Workout.distance),
    avg_heart_rate: c2Workout.heart_rate ? parseInt(c2Workout.heart_rate) : null,
    calories: c2Workout.calories || null,
    workout_date: c2Workout.date,
    notes: buildNotes(c2Workout),
  };

  return workout;
}

function determineWorkoutType(workout: any): string {
  const distance = parseInt(workout.distance || '0');
  
  // Test pieces
  if (distance === 2000) return 'test';
  if (distance === 5000) return 'test';
  if (distance === 6000) return 'test';
  if (distance === 10000) return 'test';
  
  // Check for intervals
  if (workout.rest_distance || workout.intervals) return 'intervals';
  
  // Sprint if short distance or time
  if (distance > 0 && distance < 1000) return 'sprint';
  if (workout.time && parseInt(workout.time) < 300) return 'sprint'; // Less than 5 minutes
  
  return 'steady_state';
}

function formatDuration(timeSeconds: number | string): string | null {
  if (!timeSeconds) return null;
  
  const seconds = parseInt(timeSeconds.toString());
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

function formatSplit(time: number | string | null, distance: number | string | null): string | null {
  if (!time || !distance) return null;
  
  const timeSeconds = parseInt(time.toString());
  const distanceMeters = parseInt(distance.toString());
  
  if (distanceMeters === 0) return null;
  
  // Calculate split per 500m
  const splitSeconds = (timeSeconds / distanceMeters) * 500;
  const minutes = Math.floor(splitSeconds / 60);
  const seconds = (splitSeconds % 60).toFixed(1);
  
  return `${minutes}:${seconds.padStart(4, '0')}`;
}

function buildNotes(workout: any): string {
  const notes = [];
  
  if (workout.stroke_rate) {
    notes.push(`Stroke rate: ${workout.stroke_rate} SPM`);
  }
  
  if (workout.watts) {
    notes.push(`Avg watts: ${workout.watts}`);
  }
  
  if (workout.pace) {
    notes.push(`Pace: ${workout.pace}`);
  }
  
  if (workout.comments) {
    notes.push(`Comments: ${workout.comments}`);
  }
  
  if (workout.rest_distance || workout.intervals) {
    notes.push('Interval workout');
  }
  
  return notes.join(' | ');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!authHeader) {
      throw new Error('Authorization header required');
    }

    // Verify the user token
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader);
    if (authError || !user) {
      throw new Error('Invalid user token');
    }

    // Get the user's C2 connection
    const { data: connections, error: connectionError } = await supabase
      .from('c2_connections')
      .select('*')
      .eq('user_id', user.id)
      .limit(1);

    if (connectionError || !connections?.length) {
      throw new Error('No C2 connection found');
    }

    const connection = connections[0];

    // Check if token is expired
    const now = new Date();
    const expiresAt = new Date(connection.token_expires_at);
    
    let accessToken = connection.access_token;

    if (expiresAt <= now && connection.refresh_token) {
      // Refresh the token
      const refreshResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/c2-logbook-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authHeader}`,
        },
        body: JSON.stringify({
          action: 'refresh_token',
          refresh_token: connection.refresh_token,
        }),
      });

      if (!refreshResponse.ok) {
        throw new Error('Failed to refresh token');
      }

      // Get the updated connection
      const { data: updatedConnections } = await supabase
        .from('c2_connections')
        .select('*')
        .eq('user_id', user.id)
        .limit(1);

      if (updatedConnections?.length) {
        accessToken = updatedConnections[0].access_token;
      }
    }

    // Fetch workouts from C2 API
    const fromDate = connection.last_sync_at || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days if no previous sync
    const toDate = new Date();

    const workoutsResponse = await fetch(`https://log.concept2.com/api/users/me/results?` +
      `from=${encodeURIComponent(fromDate.toISOString().split('T')[0])}&` +
      `to=${encodeURIComponent(toDate.toISOString().split('T')[0])}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!workoutsResponse.ok) {
      throw new Error('Failed to fetch workouts from C2');
    }

    const workoutsData = await workoutsResponse.json();
    const workouts = workoutsData.data || [];

    console.log(`Found ${workouts.length} workouts to sync`);

    let syncedCount = 0;
    const errors = [];

    // Process each workout
    for (const c2Workout of workouts) {
      try {
        const mappedWorkout = mapC2Workout(c2Workout);
        
        // Check if workout already exists
        const { data: existingWorkouts } = await supabase
          .from('erg_workouts')
          .select('id')
          .eq('user_id', user.id)
          .eq('workout_date', mappedWorkout.workout_date)
          .eq('distance', mappedWorkout.distance)
          .eq('duration', mappedWorkout.duration);

        if (!existingWorkouts?.length) {
          // Insert new workout
          const { error } = await supabase
            .from('erg_workouts')
            .insert({
              ...mappedWorkout,
              user_id: user.id,
            });

          if (error) {
            errors.push(`Failed to insert workout ${c2Workout.id}: ${error.message}`);
          } else {
            syncedCount++;
          }
        }
      } catch (error) {
        errors.push(`Failed to process workout ${c2Workout.id}: ${error.message}`);
      }
    }

    // Update last sync time
    await supabase
      .from('c2_connections')
      .update({
        last_sync_at: toDate.toISOString(),
      })
      .eq('user_id', user.id);

    return new Response(JSON.stringify({
      success: true,
      synced_count: syncedCount,
      total_workouts: workouts.length,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error('C2 sync error:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});