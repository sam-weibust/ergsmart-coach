import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Dumbbell } from "lucide-react";

interface HistorySectionProps {
  profile: any;
}

const HistorySection = ({ profile }: HistorySectionProps) => {
  const [ergWorkouts, setErgWorkouts] = useState<any[]>([]);
  const [strengthWorkouts, setStrengthWorkouts] = useState<any[]>([]);

  useEffect(() => {
    if (profile) {
      fetchErgHistory();
      fetchStrengthHistory();
    }
  }, [profile]);

  const fetchErgHistory = async () => {
    const { data } = await supabase
      .from("erg_workouts")
      .select("*")
      .eq("user_id", profile.id)
      .order("workout_date", { ascending: false })
      .limit(20);

    setErgWorkouts(data || []);
  };

  const fetchStrengthHistory = async () => {
    const { data } = await supabase
      .from("strength_workouts")
      .select("*")
      .eq("user_id", profile.id)
      .order("workout_date", { ascending: false })
      .limit(20);

    setStrengthWorkouts(data || []);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Workout History</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="erg">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="erg">
              <Activity className="h-4 w-4 mr-2" />
              Erg Workouts
            </TabsTrigger>
            <TabsTrigger value="strength">
              <Dumbbell className="h-4 w-4 mr-2" />
              Strength Workouts
            </TabsTrigger>
          </TabsList>

          <TabsContent value="erg" className="space-y-4 mt-4">
            {ergWorkouts.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No erg workouts logged yet.
              </p>
            ) : (
              ergWorkouts.map((workout) => (
                <div key={workout.id} className="p-4 border rounded-lg space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold capitalize">
                        {workout.workout_type.replace("_", " ")}
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {new Date(workout.workout_date).toLocaleDateString()}
                      </p>
                    </div>
                    {workout.distance && (
                      <span className="text-lg font-bold">{workout.distance}m</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {workout.duration && <span>Time: {workout.duration}</span>}
                    {workout.avg_split && <span>Avg Split: {workout.avg_split}</span>}
                    {workout.avg_heart_rate && <span>Avg HR: {workout.avg_heart_rate} bpm</span>}
                    {workout.calories && <span>Calories: {workout.calories}</span>}
                  </div>
                  {workout.notes && (
                    <p className="text-sm text-muted-foreground italic">{workout.notes}</p>
                  )}
                </div>
              ))
            )}
          </TabsContent>

          <TabsContent value="strength" className="space-y-4 mt-4">
            {strengthWorkouts.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">
                No strength workouts logged yet.
              </p>
            ) : (
              strengthWorkouts.map((workout) => (
                <div key={workout.id} className="p-4 border rounded-lg space-y-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold">{workout.exercise}</h3>
                      <p className="text-sm text-muted-foreground">
                        {new Date(workout.workout_date).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="text-lg font-bold">{workout.weight}kg</span>
                  </div>
                  <p className="text-sm">
                    {workout.sets} sets × {workout.reps} reps
                  </p>
                  {workout.notes && (
                    <p className="text-sm text-muted-foreground italic">{workout.notes}</p>
                  )}
                </div>
              ))
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default HistorySection;