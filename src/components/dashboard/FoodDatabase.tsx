import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Capacitor } from "@capacitor/core";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { getSessionUser } from "@/lib/getUser";
import { getLocalDate } from "@/lib/dateUtils";
import {
  Search, Star, Clock, Plus, Trash2, ScanBarcode, X, Loader2,
  Flame, ChefHat, BarChart3, CheckCircle2, XCircle, Trophy, Camera,
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip as RechartTooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FoodResult {
  fdcId: string;
  name: string;
  brand: string | null;
  calories_per_100g: number;
  calories_per_serving: number;
  serving_size: number;
  serving_unit: string;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
}

interface FoodDatabaseProps {
  profile: any;
  calorieTarget: number;
}

// ── Meal templates ────────────────────────────────────────────────────────────

const MEAL_TEMPLATES = [
  {
    name: "Pre-Race Meal",
    description: "Light, high-carb, 3-4 hrs before race",
    meal_type: "Breakfast",
    foods: [
      { food_name: "Oatmeal with banana", calories: 350, protein: 8, carbs: 70, fat: 5 },
      { food_name: "White toast with honey", calories: 200, protein: 4, carbs: 44, fat: 1 },
      { food_name: "Sports drink", calories: 80, protein: 0, carbs: 20, fat: 0 },
    ],
  },
  {
    name: "Post-Workout Recovery",
    description: "4:1 carb-to-protein ratio within 30 min",
    meal_type: "Snacks",
    foods: [
      { food_name: "Chocolate milk (16oz)", calories: 300, protein: 16, carbs: 48, fat: 5 },
      { food_name: "Banana", calories: 105, protein: 1, carbs: 27, fat: 0 },
      { food_name: "Rice cakes with peanut butter", calories: 250, protein: 8, carbs: 30, fat: 10 },
    ],
  },
  {
    name: "High Carb Training Day",
    description: "Fuel heavy training volume",
    meal_type: "Lunch",
    foods: [
      { food_name: "Pasta with marinara (2 cups)", calories: 600, protein: 20, carbs: 110, fat: 5 },
      { food_name: "Garlic bread (2 slices)", calories: 200, protein: 5, carbs: 30, fat: 8 },
      { food_name: "Apple", calories: 95, protein: 0, carbs: 25, fat: 0 },
    ],
  },
  {
    name: "Rest Day Nutrition",
    description: "Lower calories, high protein",
    meal_type: "Dinner",
    foods: [
      { food_name: "Grilled chicken breast (200g)", calories: 330, protein: 62, carbs: 0, fat: 7 },
      { food_name: "Steamed broccoli and carrots", calories: 80, protein: 4, carbs: 16, fat: 0 },
      { food_name: "Brown rice (1 cup cooked)", calories: 215, protein: 5, carbs: 45, fat: 2 },
    ],
  },
  {
    name: "Lightweight Cut Meal",
    description: "High protein, low carb",
    meal_type: "Breakfast",
    foods: [
      { food_name: "Egg white omelette (5 whites)", calories: 85, protein: 18, carbs: 1, fat: 0 },
      { food_name: "Spinach and mushrooms sauté", calories: 40, protein: 4, carbs: 5, fat: 1 },
      { food_name: "Black coffee", calories: 5, protein: 0, carbs: 1, fat: 0 },
    ],
  },
  {
    name: "Morning Practice Fuel",
    description: "Quick energy before early session",
    meal_type: "Breakfast",
    foods: [
      { food_name: "Greek yogurt (1 cup)", calories: 130, protein: 17, carbs: 9, fat: 0 },
      { food_name: "Granola (1/4 cup)", calories: 120, protein: 3, carbs: 22, fat: 3 },
      { food_name: "Orange juice (8oz)", calories: 110, protein: 2, carbs: 26, fat: 0 },
    ],
  },
  {
    name: "Long Distance Fuel",
    description: "Sustained energy for 90+ min sessions",
    meal_type: "Snacks",
    foods: [
      { food_name: "PB&J on whole wheat", calories: 450, protein: 16, carbs: 58, fat: 16 },
      { food_name: "Banana", calories: 105, protein: 1, carbs: 27, fat: 0 },
      { food_name: "Trail mix (1oz)", calories: 130, protein: 3, carbs: 14, fat: 8 },
    ],
  },
  {
    name: "Race Day Breakfast",
    description: "Competition morning — easy to digest",
    meal_type: "Breakfast",
    foods: [
      { food_name: "Plain bagel with cream cheese", calories: 380, protein: 12, carbs: 68, fat: 8 },
      { food_name: "Scrambled eggs (2)", calories: 180, protein: 12, carbs: 2, fat: 12 },
      { food_name: "Orange", calories: 62, protein: 1, carbs: 15, fat: 0 },
    ],
  },
  {
    name: "Evening Carb Load",
    description: "Night before a big race",
    meal_type: "Dinner",
    foods: [
      { food_name: "White rice (2 cups cooked)", calories: 430, protein: 8, carbs: 94, fat: 0 },
      { food_name: "Baked salmon fillet (150g)", calories: 280, protein: 28, carbs: 0, fat: 17 },
      { food_name: "White bread (2 slices)", calories: 160, protein: 5, carbs: 30, fat: 2 },
    ],
  },
  {
    name: "Protein Recovery Bowl",
    description: "Post-workout muscle repair, 2+ hrs after",
    meal_type: "Lunch",
    foods: [
      { food_name: "Quinoa (1 cup cooked)", calories: 222, protein: 8, carbs: 39, fat: 4 },
      { food_name: "Grilled chicken thigh (150g)", calories: 280, protein: 30, carbs: 0, fat: 17 },
      { food_name: "Roasted sweet potato (medium)", calories: 180, protein: 4, carbs: 41, fat: 0 },
    ],
  },
];

const MEAL_COLORS = { Breakfast: "#f59e0b", Lunch: "#10b981", Dinner: "#3b82f6", Snacks: "#8b5cf6" };
const MACRO_COLORS = { protein: "#ef4444", carbs: "#f59e0b", fat: "#3b82f6" };

// ── Helpers ───────────────────────────────────────────────────────────────────

function scaledNutrients(food: FoodResult, qty: number) {
  const factor = qty;
  return {
    calories: Math.round(food.calories_per_serving * factor),
    protein: Math.round(food.protein * factor * 10) / 10,
    carbs: Math.round(food.carbs * factor * 10) / 10,
    fat: Math.round(food.fat * factor * 10) / 10,
    fiber: Math.round(food.fiber * factor * 10) / 10,
    sugar: Math.round(food.sugar * factor * 10) / 10,
  };
}

function fmtDate(dateStr: string) {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

function hitGoal(actual: number, goal: number) {
  return goal > 0 && actual >= goal * 0.9;
}

// ── Add food dialog ───────────────────────────────────────────────────────────

function AddFoodDialog({
  food,
  onAdd,
  onClose,
}: {
  food: FoodResult;
  onAdd: (mealType: string, qty: number) => void;
  onClose: () => void;
}) {
  const [mealType, setMealType] = useState("Breakfast");
  const [qty, setQty] = useState(1);
  const n = scaledNutrients(food, qty);

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base leading-tight">{food.name}</DialogTitle>
          {food.brand && <p className="text-xs text-muted-foreground">{food.brand}</p>}
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-2 text-center text-sm">
            <div className="bg-muted rounded-lg p-2">
              <div className="font-bold text-base">{n.calories}</div>
              <div className="text-xs text-muted-foreground">kcal</div>
            </div>
            <div className="bg-muted rounded-lg p-2">
              <div className="font-bold text-red-500">{n.protein}g</div>
              <div className="text-xs text-muted-foreground">protein</div>
            </div>
            <div className="bg-muted rounded-lg p-2">
              <div className="font-bold text-amber-500">{n.carbs}g</div>
              <div className="text-xs text-muted-foreground">carbs</div>
            </div>
            <div className="bg-muted rounded-lg p-2">
              <div className="font-bold text-blue-500">{n.fat}g</div>
              <div className="text-xs text-muted-foreground">fat</div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground text-center">
            per {food.serving_size}{food.serving_unit} serving
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Servings</Label>
              <Input
                type="number"
                min={0.25}
                step={0.25}
                value={qty}
                onChange={e => setQty(Math.max(0.25, parseFloat(e.target.value) || 1))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Meal</Label>
              <Select value={mealType} onValueChange={setMealType}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Breakfast", "Lunch", "Dinner", "Snacks"].map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button className="w-full" onClick={() => onAdd(mealType, qty)}>
            <Plus className="h-4 w-4 mr-1" /> Add to Log
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const FoodDatabase = ({ profile, calorieTarget }: FoodDatabaseProps) => {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedFood, setSelectedFood] = useState<FoodResult | null>(null);
  const [addTab, setAddTab] = useState("search");
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customForm, setCustomForm] = useState({
    food_name: "", calories_per_100g: "", protein_per_100g: "", carbs_per_100g: "", fat_per_100g: "",
    default_serving_size: "100", default_serving_unit: "g",
  });
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scannerActive, setScannerActive] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [barcodeQuery, setBarcodeQuery] = useState("");
  const [savedSummary, setSavedSummary] = useState<{
    calories: number; protein: number; carbs: number; fat: number;
    goalCal: number; goalPro: number; goalCarb: number; goalFat: number;
  } | null>(null);

  const today = getLocalDate();

  // Derived macro goals
  const proteinGoal = Math.round(calorieTarget * 0.25 / 4);
  const carbsGoal = Math.round(calorieTarget * 0.5 / 4);
  const fatGoal = Math.round(calorieTarget * 0.25 / 9);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Fetch today's log — filtered by local date
  const { data: todayLog = [] } = useQuery({
    queryKey: ["food-log-today", today],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return [];
      const { data } = await supabase
        .from("food_log")
        .select("*")
        .eq("user_id", user.id)
        .eq("date", today)
        .order("created_at", { ascending: true });
      return data ?? [];
    },
  });

  // Fetch recent foods (last 10 distinct)
  const { data: recentFoods = [] } = useQuery({
    queryKey: ["food-log-recent"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return [];
      const { data } = await supabase
        .from("food_log")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50);
      const seen = new Set<string>();
      const out: any[] = [];
      for (const f of (data ?? [])) {
        if (!seen.has(f.food_name)) { seen.add(f.food_name); out.push(f); }
        if (out.length === 10) break;
      }
      return out;
    },
  });

  // Fetch favorites
  const { data: favorites = [] } = useQuery({
    queryKey: ["favorite-foods"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return [];
      const { data } = await supabase
        .from("favorite_foods")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // Fetch custom foods
  const { data: customFoods = [] } = useQuery({
    queryKey: ["custom-foods"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return [];
      const { data } = await supabase
        .from("custom_foods")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // 14-day macro data for charts
  const { data: fourteenDayData = [] } = useQuery({
    queryKey: ["food-log-14day", calorieTarget],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return [];
      const days = Array.from({ length: 14 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (13 - i));
        return getLocalDate(d);
      });
      const { data } = await supabase
        .from("food_log")
        .select("date, calories, protein, carbs, fat")
        .eq("user_id", user.id)
        .in("date", days);
      const byDate: Record<string, { calories: number; protein: number; carbs: number; fat: number }> = {};
      for (const d of days) byDate[d] = { calories: 0, protein: 0, carbs: 0, fat: 0 };
      for (const row of (data ?? [])) {
        byDate[row.date].calories += Number(row.calories);
        byDate[row.date].protein += Number(row.protein);
        byDate[row.date].carbs += Number(row.carbs);
        byDate[row.date].fat += Number(row.fat);
      }
      return days.map(d => ({
        label: new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "numeric", day: "numeric" }),
        calories: Math.round(byDate[d].calories),
        protein: Math.round(byDate[d].protein),
        carbs: Math.round(byDate[d].carbs),
        fat: Math.round(byDate[d].fat),
      }));
    },
  });

  // Meal history from daily_nutrition_summary
  const { data: historyData = [] } = useQuery({
    queryKey: ["nutrition-history"],
    queryFn: async () => {
      const user = await getSessionUser();
      if (!user) return [];
      const { data } = await (supabase as any)
        .from("daily_nutrition_summary")
        .select("*")
        .eq("user_id", user.id)
        .order("date", { ascending: false })
        .limit(30);
      return data ?? [];
    },
  });

  // USDA food search
  const { data: searchData, isLoading: isSearching, error: searchError } = useQuery({
    queryKey: ["food-search", debouncedQuery],
    enabled: debouncedQuery.length >= 2,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("search-foods", {
        body: { query: debouncedQuery },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return (data?.results ?? []) as FoodResult[];
    },
  });

  const searchResults = searchData ?? [];

  // Daily totals from food_log
  const totals = todayLog.reduce(
    (acc: any, f: any) => ({
      calories: acc.calories + Number(f.calories),
      protein: acc.protein + Number(f.protein),
      carbs: acc.carbs + Number(f.carbs),
      fat: acc.fat + Number(f.fat),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  const MEAL_TYPES = ["Breakfast", "Lunch", "Dinner", "Snacks"] as const;
  const byMeal = MEAL_TYPES.reduce((acc, mt) => {
    acc[mt] = todayLog.filter((f: any) => f.meal_type === mt);
    return acc;
  }, {} as Record<string, any[]>);

  // Macro donut data
  const donutData = [
    { name: "Protein", value: Math.round(totals.protein * 4), color: MACRO_COLORS.protein },
    { name: "Carbs", value: Math.round(totals.carbs * 4), color: MACRO_COLORS.carbs },
    { name: "Fat", value: Math.round(totals.fat * 9), color: MACRO_COLORS.fat },
  ].filter(d => d.value > 0);

  // Mutations
  const addToLog = useMutation({
    mutationFn: async ({ food, mealType, qty }: { food: FoodResult; mealType: string; qty: number }) => {
      const user = await getSessionUser();
      if (!user) throw new Error("Not signed in");
      const n = scaledNutrients(food, qty);
      const { error } = await (supabase.from("food_log") as any).insert({
        user_id: user.id,
        date: today,
        meal_type: mealType,
        food_name: food.name,
        brand: food.brand,
        food_data_id: food.fdcId,
        serving_size: food.serving_size,
        serving_unit: food.serving_unit,
        serving_quantity: qty,
        source: "usda",
        ...n,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["food-log-today"] });
      qc.invalidateQueries({ queryKey: ["food-log-recent"] });
      qc.invalidateQueries({ queryKey: ["food-log-14day"] });
      setSelectedFood(null);
      toast({ title: "Logged!" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addRecentToLog = useMutation({
    mutationFn: async (food: any) => {
      const user = await getSessionUser();
      if (!user) throw new Error("Not signed in");
      const { error } = await (supabase.from("food_log") as any).insert({
        user_id: user.id,
        date: today,
        meal_type: food.meal_type,
        food_name: food.food_name,
        brand: food.brand,
        calories: food.calories,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
        fiber: food.fiber,
        sugar: food.sugar,
        serving_size: food.serving_size,
        serving_unit: food.serving_unit,
        serving_quantity: food.serving_quantity,
        food_data_id: food.food_data_id,
        source: food.source,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["food-log-today"] });
      qc.invalidateQueries({ queryKey: ["food-log-14day"] });
      toast({ title: "Re-added!" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const removeFromLog = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("food_log").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["food-log-today"] });
      qc.invalidateQueries({ queryKey: ["food-log-14day"] });
    },
  });

  const toggleFavorite = useMutation({
    mutationFn: async (food: FoodResult) => {
      const user = await getSessionUser();
      if (!user) return;
      const exists = favorites.find((f: any) => f.food_name === food.name);
      if (exists) {
        await supabase.from("favorite_foods").delete().eq("id", exists.id);
      } else {
        await (supabase.from("favorite_foods") as any).insert({
          user_id: user.id,
          food_name: food.name,
          food_data: food,
        });
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["favorite-foods"] }),
  });

  const saveCustomFood = useMutation({
    mutationFn: async () => {
      const user = await getSessionUser();
      if (!user) throw new Error("Not signed in");
      const { error } = await (supabase.from("custom_foods") as any).insert({
        user_id: user.id,
        food_name: customForm.food_name,
        calories_per_100g: parseFloat(customForm.calories_per_100g) || 0,
        protein_per_100g: parseFloat(customForm.protein_per_100g) || 0,
        carbs_per_100g: parseFloat(customForm.carbs_per_100g) || 0,
        fat_per_100g: parseFloat(customForm.fat_per_100g) || 0,
        default_serving_size: parseFloat(customForm.default_serving_size) || 100,
        default_serving_unit: customForm.default_serving_unit,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["custom-foods"] });
      setShowCustomForm(false);
      setCustomForm({ food_name: "", calories_per_100g: "", protein_per_100g: "", carbs_per_100g: "", fat_per_100g: "", default_serving_size: "100", default_serving_unit: "g" });
      toast({ title: "Custom food saved!" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addTemplateToLog = useMutation({
    mutationFn: async (template: typeof MEAL_TEMPLATES[0]) => {
      const user = await getSessionUser();
      if (!user) throw new Error("Not signed in");
      const rows = template.foods.map(f => ({
        user_id: user.id,
        date: today,
        meal_type: template.meal_type,
        food_name: f.food_name,
        calories: f.calories,
        protein: f.protein,
        carbs: f.carbs,
        fat: f.fat,
        serving_size: 1,
        serving_unit: "serving",
        serving_quantity: 1,
        source: "template",
      }));
      const { error } = await (supabase.from("food_log") as any).insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["food-log-today"] });
      qc.invalidateQueries({ queryKey: ["food-log-14day"] });
      toast({ title: "Template added to today's log!" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const saveAndFinish = useMutation({
    mutationFn: async () => {
      const user = await getSessionUser();
      if (!user) throw new Error("Not signed in");
      const { error } = await (supabase as any)
        .from("daily_nutrition_summary")
        .upsert({
          user_id: user.id,
          date: today,
          total_calories: Math.round(totals.calories),
          total_protein: Math.round(totals.protein),
          total_carbs: Math.round(totals.carbs),
          total_fat: Math.round(totals.fat),
          goal_calories: calorieTarget,
          goal_protein: proteinGoal,
          goal_carbs: carbsGoal,
          goal_fat: fatGoal,
          completed: true,
        }, { onConflict: "user_id,date" });
      if (error) throw error;
    },
    onSuccess: () => {
      setSavedSummary({
        calories: Math.round(totals.calories),
        protein: Math.round(totals.protein),
        carbs: Math.round(totals.carbs),
        fat: Math.round(totals.fat),
        goalCal: calorieTarget,
        goalPro: proteinGoal,
        goalCarb: carbsGoal,
        goalFat: fatGoal,
      });
      qc.invalidateQueries({ queryKey: ["nutrition-history"] });
      toast({ title: "Day saved!" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // ── Barcode / Camera scanner ───────────────────────────────────────────────

  const stopWebCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setScannerActive(false);
  }, []);

  /** Send base64 image to scan-barcode edge function and handle result */
  const handleScanResult = useCallback(async (base64: string, mimeType = "image/jpeg") => {
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("scan-barcode", {
        body: { imageBase64: base64, mimeType },
      });
      if (error) throw error;
      if (data?.type === "food") {
        const food: FoodResult = {
          fdcId: data.barcode ? `barcode_${data.barcode}` : `scan_${Date.now()}`,
          name: data.name,
          brand: data.brand ?? null,
          calories_per_100g: data.calories,
          calories_per_serving: data.calories,
          serving_size: typeof data.serving_size === "number" ? data.serving_size : 1,
          serving_unit: typeof data.serving_size === "string" ? data.serving_size : "serving",
          protein: data.protein ?? 0,
          carbs: data.carbs ?? 0,
          fat: data.fat ?? 0,
          fiber: 0,
          sugar: 0,
        };
        setSelectedFood(food);
        toast({ title: "Food found!", description: food.name });
        stopWebCamera();
      } else {
        toast({
          title: "Nothing detected",
          description: data?.message ?? "Try again or enter manually.",
          variant: "destructive",
        });
      }
    } catch (e: any) {
      toast({ title: "Scan failed", description: e.message, variant: "destructive" });
    } finally {
      setScanning(false);
    }
  }, [stopWebCamera, toast]);

  /** iOS native: use Capacitor Camera to take a photo */
  const startNativeScan = useCallback(async () => {
    setScanning(true);
    try {
      const { Camera, CameraSource, CameraResultType } = await import("@capacitor/camera");
      const photo = await Camera.getPhoto({
        source: CameraSource.Camera,
        resultType: CameraResultType.DataUrl,
        quality: 80,
        width: 1280,
      });
      if (!photo.dataUrl) throw new Error("No image captured");
      // dataUrl is "data:image/jpeg;base64,..." — strip prefix
      const [header, base64] = photo.dataUrl.split(",");
      const mimeType = header.match(/data:([^;]+)/)?.[1] ?? "image/jpeg";
      await handleScanResult(base64, mimeType);
    } catch (e: any) {
      if (e?.message !== "User cancelled photos app") {
        toast({ title: "Camera failed", description: e?.message, variant: "destructive" });
      }
      setScanning(false);
    }
  }, [handleScanResult, toast]);

  /** Web: open getUserMedia camera viewfinder */
  const startWebCamera = useCallback(async () => {
    if (scannerActive) { stopWebCamera(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 } },
      });
      streamRef.current = stream;
      setScannerActive(true);
      // Attach stream to video element after state update
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 50);
    } catch {
      toast({ title: "Camera unavailable", variant: "destructive" });
    }
  }, [scannerActive, stopWebCamera, toast]);

  /** Web: capture current video frame and send for scanning */
  const captureWebFrame = useCallback(async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    const base64 = dataUrl.split(",")[1];
    stopWebCamera();
    await handleScanResult(base64, "image/jpeg");
  }, [stopWebCamera, handleScanResult]);

  const isNative = Capacitor.isNativePlatform();
  const handleScanButton = useCallback(() => {
    if (isNative) {
      startNativeScan();
    } else {
      startWebCamera();
    }
  }, [isNative, startNativeScan, startWebCamera]);

  const isFavorited = (name: string) => favorites.some((f: any) => f.food_name === name);

  // ── Result row ──────────────────────────────────────────────────────────────

  function FoodRow({ food }: { food: FoodResult }) {
    return (
      <div className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors">
        <div className="flex-1 min-w-0">
          <div className="font-medium text-sm truncate">{food.name}</div>
          {food.brand && <div className="text-xs text-muted-foreground truncate">{food.brand}</div>}
          <div className="text-xs text-muted-foreground mt-0.5">
            <span className="font-semibold text-foreground">{food.calories_per_serving} kcal</span>
            {" · "}P {food.protein}g · C {food.carbs}g · F {food.fat}g
            {" · "}{food.serving_size}{food.serving_unit}
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => toggleFavorite.mutate(food)}
            className={`p-1 rounded hover:bg-muted transition-colors ${isFavorited(food.name) ? "text-yellow-500" : "text-muted-foreground"}`}
          >
            <Star className="h-3.5 w-3.5" />
          </button>
          <Button size="sm" variant="default" className="h-7 text-xs px-2" onClick={() => setSelectedFood(food)}>
            <Plus className="h-3 w-3 mr-1" />Add
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Daily summary */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Flame className="h-4 w-4 text-orange-500" />
              Today — {Math.round(totals.calories)} / {calorieTarget} kcal
            </CardTitle>
            <span className={`text-sm font-semibold ${totals.calories > calorieTarget ? "text-red-500" : "text-emerald-600"}`}>
              {calorieTarget - Math.round(totals.calories) >= 0
                ? `${calorieTarget - Math.round(totals.calories)} remaining`
                : `${Math.round(totals.calories) - calorieTarget} over`}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Progress value={Math.min((totals.calories / calorieTarget) * 100, 100)} className="h-2" />
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            {[
              { label: "Protein", val: totals.protein, color: "text-red-500", goal: proteinGoal },
              { label: "Carbs", val: totals.carbs, color: "text-amber-500", goal: carbsGoal },
              { label: "Fat", val: totals.fat, color: "text-blue-500", goal: fatGoal },
            ].map(m => (
              <div key={m.label} className="bg-muted rounded-lg p-2">
                <div className={`font-bold ${m.color}`}>{Math.round(m.val)}g</div>
                <div className="text-xs text-muted-foreground">{m.label} / {m.goal}g</div>
                <Progress value={Math.min((m.val / m.goal) * 100, 100)} className="h-1 mt-1" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Add food section */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Add Food</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={addTab} onValueChange={setAddTab}>
            <TabsList className="grid grid-cols-5 h-8 text-xs mb-3">
              <TabsTrigger value="search" className="text-xs gap-1"><Search className="h-3 w-3" />Search</TabsTrigger>
              <TabsTrigger value="recent" className="text-xs gap-1"><Clock className="h-3 w-3" />Recent</TabsTrigger>
              <TabsTrigger value="favorites" className="text-xs gap-1"><Star className="h-3 w-3" />Saved</TabsTrigger>
              <TabsTrigger value="custom" className="text-xs gap-1"><Plus className="h-3 w-3" />Custom</TabsTrigger>
              <TabsTrigger value="templates" className="text-xs gap-1"><ChefHat className="h-3 w-3" />Plans</TabsTrigger>
            </TabsList>

            {/* Search tab */}
            <TabsContent value="search" className="space-y-2">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input
                    className="pl-8 h-9 text-sm"
                    placeholder="Search 600,000+ foods..."
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    autoComplete="off"
                  />
                  {searchInput && (
                    <button onClick={() => { setSearchInput(""); setDebouncedQuery(""); }} className="absolute right-2.5 top-2.5">
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  )}
                </div>
                <Button
                  variant={scannerActive ? "destructive" : "outline"}
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={handleScanButton}
                  disabled={scanning}
                  title={isNative ? "Scan with camera" : "Open camera scanner"}
                >
                  {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : scannerActive ? <X className="h-4 w-4" /> : <Camera className="h-4 w-4" />}
                </Button>
              </div>

              {/* Web camera viewfinder */}
              {scannerActive && !isNative && (
                <div className="relative rounded-lg overflow-hidden border bg-black">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full max-h-48 object-cover"
                  />
                  {/* Scanning frame overlay */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-48 h-32 border-2 border-white rounded-lg opacity-80" style={{
                      boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
                    }} />
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 flex gap-2 p-3 bg-black/60">
                    <Button
                      size="sm"
                      className="flex-1 h-9"
                      onClick={captureWebFrame}
                      disabled={scanning}
                    >
                      {scanning ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Camera className="h-4 w-4 mr-1" />}
                      {scanning ? "Scanning..." : "Capture"}
                    </Button>
                    <Button size="sm" variant="outline" className="h-9 bg-transparent text-white border-white/40" onClick={stopWebCamera}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {!scannerActive && (
                <div className="flex gap-2">
                  <Input
                    className="h-8 text-xs"
                    placeholder="Or type barcode number..."
                    value={barcodeQuery}
                    onChange={e => setBarcodeQuery(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && barcodeQuery && handleScanResult(barcodeQuery)}
                  />
                  {barcodeQuery && (
                    <Button size="sm" className="h-8 text-xs px-2" onClick={async () => {
                      // Direct barcode number lookup via Open Food Facts
                      const code = barcodeQuery.replace(/\D/g, "");
                      if (!code) return;
                      setScanning(true);
                      try {
                        const off = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`);
                        const data = await off.json();
                        if (data.status === 1 && data.product) {
                          const p = data.product;
                          const n = p.nutriments ?? {};
                          const food: FoodResult = {
                            fdcId: `barcode_${code}`,
                            name: p.product_name || `Product ${code}`,
                            brand: p.brands || null,
                            calories_per_100g: Math.round(n["energy-kcal_100g"] || 0),
                            calories_per_serving: Math.round(n["energy-kcal_serving"] || n["energy-kcal_100g"] || 0),
                            serving_size: p.serving_quantity || 100,
                            serving_unit: "g",
                            protein: Math.round((n.proteins_serving ?? n.proteins_100g ?? 0) * 10) / 10,
                            carbs: Math.round((n.carbohydrates_serving ?? n.carbohydrates_100g ?? 0) * 10) / 10,
                            fat: Math.round((n.fat_serving ?? n.fat_100g ?? 0) * 10) / 10,
                            fiber: Math.round((n.fiber_serving ?? n.fiber_100g ?? 0) * 10) / 10,
                            sugar: Math.round((n.sugars_serving ?? n.sugars_100g ?? 0) * 10) / 10,
                          };
                          setSelectedFood(food);
                          setBarcodeQuery("");
                          toast({ title: "Found!", description: food.name });
                        } else {
                          toast({ title: "Not found", description: "Try searching by name.", variant: "destructive" });
                        }
                      } catch {
                        toast({ title: "Lookup failed", variant: "destructive" });
                      } finally { setScanning(false); }
                    }}>
                      {scanning ? <Loader2 className="h-3 w-3 animate-spin" /> : "Look up"}
                    </Button>
                  )}
                </div>
              )}

              {isSearching && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />Searching USDA database...
                </div>
              )}
              {searchError && !isSearching && (
                <p className="text-sm text-red-500 py-2">Search failed: {(searchError as Error).message}. Check your connection and try again.</p>
              )}
              {!isSearching && !searchError && debouncedQuery.length >= 2 && searchResults.length === 0 && (
                <p className="text-sm text-muted-foreground py-2">No results. Try a different term.</p>
              )}
              <div className="divide-y divide-border max-h-[400px] overflow-y-auto">
                {searchResults.map(food => <FoodRow key={food.fdcId} food={food} />)}
              </div>
              {!debouncedQuery && (
                <p className="text-xs text-muted-foreground text-center py-3">
                  Powered by USDA FoodData Central · 600,000+ foods
                </p>
              )}
            </TabsContent>

            {/* Recent tab */}
            <TabsContent value="recent" className="space-y-1">
              {recentFoods.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No recent foods yet.</p>
              ) : (
                <div className="divide-y divide-border">
                  {recentFoods.map((food: any) => (
                    <div key={food.id} className="flex items-center gap-2 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{food.food_name}</div>
                        <div className="text-xs text-muted-foreground">{food.calories} kcal · {food.meal_type}</div>
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => addRecentToLog.mutate(food)}>
                        <Plus className="h-3 w-3 mr-1" />Add
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Favorites tab */}
            <TabsContent value="favorites" className="space-y-1">
              {favorites.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No favorites yet. Star foods from search results.</p>
              ) : (
                <div className="divide-y divide-border">
                  {favorites.map((fav: any) => {
                    const food = fav.food_data as FoodResult;
                    return (
                      <div key={fav.id} className="flex items-center gap-2 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{fav.food_name}</div>
                          {food?.calories_per_serving && (
                            <div className="text-xs text-muted-foreground">{food.calories_per_serving} kcal · {food.serving_size}{food.serving_unit}</div>
                          )}
                        </div>
                        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedFood(food)}>
                          <Plus className="h-3 w-3 mr-1" />Add
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* Custom foods tab */}
            <TabsContent value="custom" className="space-y-3">
              {!showCustomForm && (
                <Button size="sm" variant="outline" className="w-full h-8 text-xs" onClick={() => setShowCustomForm(true)}>
                  <Plus className="h-3 w-3 mr-1" />Create Custom Food
                </Button>
              )}
              {showCustomForm && (
                <div className="space-y-2 p-3 border rounded-lg bg-muted/30">
                  <Input className="h-8 text-xs" placeholder="Food name" value={customForm.food_name}
                    onChange={e => setCustomForm(p => ({ ...p, food_name: e.target.value }))} />
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ["Calories/100g", "calories_per_100g"],
                      ["Protein/100g (g)", "protein_per_100g"],
                      ["Carbs/100g (g)", "carbs_per_100g"],
                      ["Fat/100g (g)", "fat_per_100g"],
                    ].map(([label, key]) => (
                      <div key={key}>
                        <Label className="text-xs">{label}</Label>
                        <Input type="number" className="h-7 text-xs" value={(customForm as any)[key]}
                          onChange={e => setCustomForm(p => ({ ...p, [key]: e.target.value }))} />
                      </div>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Serving size</Label>
                      <Input type="number" className="h-7 text-xs" value={customForm.default_serving_size}
                        onChange={e => setCustomForm(p => ({ ...p, default_serving_size: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs">Unit</Label>
                      <Input className="h-7 text-xs" value={customForm.default_serving_unit}
                        onChange={e => setCustomForm(p => ({ ...p, default_serving_unit: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 h-7 text-xs" onClick={() => saveCustomFood.mutate()}
                      disabled={!customForm.food_name || saveCustomFood.isPending}>
                      {saveCustomFood.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowCustomForm(false)}>Cancel</Button>
                  </div>
                </div>
              )}
              <div className="divide-y divide-border">
                {customFoods.map((cf: any) => {
                  const f = cf.default_serving_size / 100;
                  const food: FoodResult = {
                    fdcId: `custom_${cf.id}`,
                    name: cf.food_name,
                    brand: "Custom",
                    calories_per_100g: cf.calories_per_100g,
                    calories_per_serving: Math.round(cf.calories_per_100g * f),
                    serving_size: cf.default_serving_size,
                    serving_unit: cf.default_serving_unit,
                    protein: Math.round(cf.protein_per_100g * f * 10) / 10,
                    carbs: Math.round(cf.carbs_per_100g * f * 10) / 10,
                    fat: Math.round(cf.fat_per_100g * f * 10) / 10,
                    fiber: 0,
                    sugar: 0,
                  };
                  return (
                    <div key={cf.id} className="flex items-center gap-2 py-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm">{cf.food_name}</div>
                        <div className="text-xs text-muted-foreground">{food.calories_per_serving} kcal · {cf.default_serving_size}{cf.default_serving_unit}</div>
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedFood(food)}>
                        <Plus className="h-3 w-3 mr-1" />Add
                      </Button>
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            {/* Meal templates tab */}
            <TabsContent value="templates" className="space-y-2">
              <p className="text-xs text-muted-foreground">Pre-built rowing nutrition templates — adds all foods to today's log.</p>
              {MEAL_TEMPLATES.map((tmpl, i) => (
                <div key={i} className="flex items-start gap-2 p-2 border rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{tmpl.name}</div>
                    <div className="text-xs text-muted-foreground">{tmpl.description}</div>
                    <div className="text-xs mt-1">
                      <Badge variant="outline" className="text-xs h-4 mr-1">{tmpl.meal_type}</Badge>
                      {Math.round(tmpl.foods.reduce((a, f) => a + f.calories, 0))} kcal total
                    </div>
                  </div>
                  <Button size="sm" className="h-7 text-xs shrink-0" onClick={() => addTemplateToLog.mutate(tmpl)}
                    disabled={addTemplateToLog.isPending}>
                    <Plus className="h-3 w-3 mr-1" />Add
                  </Button>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Daily food log by meal */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Today's Log</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {MEAL_TYPES.map(mt => {
            const foods = byMeal[mt];
            const mealCals = foods.reduce((a: number, f: any) => a + Number(f.calories), 0);
            return (
              <div key={mt}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold" style={{ color: MEAL_COLORS[mt] }}>{mt}</span>
                  <span className="text-xs text-muted-foreground">{Math.round(mealCals)} kcal</span>
                </div>
                {foods.length === 0 ? (
                  <p className="text-xs text-muted-foreground pl-1">Nothing logged yet.</p>
                ) : (
                  <div className="space-y-1">
                    {foods.map((f: any) => (
                      <div key={f.id} className="flex items-center gap-2 text-sm py-1 px-2 rounded-md hover:bg-muted/40">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium truncate block">{f.food_name}</span>
                          <span className="text-xs text-muted-foreground">
                            {f.serving_quantity && f.serving_quantity !== 1 ? `${f.serving_quantity}× ` : ""}
                            P {Math.round(f.protein)}g · C {Math.round(f.carbs)}g · F {Math.round(f.fat)}g
                          </span>
                        </div>
                        <span className="text-sm font-semibold shrink-0">{Math.round(f.calories)} kcal</span>
                        <button onClick={() => removeFromLog.mutate(f.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {/* Daily total */}
          {todayLog.length > 0 && (
            <div className="pt-3 border-t grid grid-cols-4 gap-2 text-center text-sm">
              <div className="bg-muted rounded p-2">
                <div className="font-bold">{Math.round(totals.calories)}</div>
                <div className="text-xs text-muted-foreground">kcal</div>
              </div>
              <div className="bg-muted rounded p-2">
                <div className="font-bold text-red-500">{Math.round(totals.protein)}g</div>
                <div className="text-xs text-muted-foreground">protein</div>
              </div>
              <div className="bg-muted rounded p-2">
                <div className="font-bold text-amber-500">{Math.round(totals.carbs)}g</div>
                <div className="text-xs text-muted-foreground">carbs</div>
              </div>
              <div className="bg-muted rounded p-2">
                <div className="font-bold text-blue-500">{Math.round(totals.fat)}g</div>
                <div className="text-xs text-muted-foreground">fat</div>
              </div>
            </div>
          )}

          {/* Save and Finish */}
          {todayLog.length > 0 && !savedSummary && (
            <Button
              className="w-full mt-2"
              onClick={() => saveAndFinish.mutate()}
              disabled={saveAndFinish.isPending}
            >
              {saveAndFinish.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</>
                : <><Trophy className="h-4 w-4 mr-2" />Save and Finish Day</>}
            </Button>
          )}

          {/* Post-save summary */}
          {savedSummary && (
            <div className="mt-3 p-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 space-y-3">
              <div className="flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-400">
                <Trophy className="h-4 w-4" />
                Day Complete!
              </div>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                {[
                  { label: "Calories", actual: savedSummary.calories, goal: savedSummary.goalCal, unit: "kcal", color: "text-foreground" },
                  { label: "Protein", actual: savedSummary.protein, goal: savedSummary.goalPro, unit: "g", color: "text-red-500" },
                  { label: "Carbs", actual: savedSummary.carbs, goal: savedSummary.goalCarb, unit: "g", color: "text-amber-500" },
                  { label: "Fat", actual: savedSummary.fat, goal: savedSummary.goalFat, unit: "g", color: "text-blue-500" },
                ].map(({ label, actual, goal, unit, color }) => (
                  <div key={label} className="bg-background rounded-lg p-2">
                    <div className={`font-bold text-sm ${color}`}>{actual}{unit}</div>
                    <div className="text-muted-foreground">/ {goal}{unit}</div>
                    <div className="mt-1">
                      {hitGoal(actual, goal)
                        ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 mx-auto" />
                        : <XCircle className="h-3.5 w-3.5 text-red-500 mx-auto" />}
                    </div>
                    <div className="text-muted-foreground mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
              <button
                className="text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-center"
                onClick={() => setSavedSummary(null)}
              >
                Dismiss
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Meal History */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Meal History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historyData.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No completed days yet. Tap "Save and Finish Day" to record a day.
            </p>
          ) : (
            <div className="space-y-2">
              {historyData.map((day: any) => (
                <div key={day.id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm">{fmtDate(day.date)}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {day.total_calories} / {day.goal_calories} kcal
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    {[
                      { label: "Cal", actual: day.total_calories, goal: day.goal_calories },
                      { label: "Pro", actual: day.total_protein, goal: day.goal_protein },
                      { label: "Carb", actual: day.total_carbs, goal: day.goal_carbs },
                      { label: "Fat", actual: day.total_fat, goal: day.goal_fat },
                    ].map(({ label, actual, goal }) => (
                      <div key={label} className="flex flex-col items-center gap-0.5">
                        {hitGoal(actual, goal)
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          : <XCircle className="h-3.5 w-3.5 text-red-500" />}
                        <span className="text-[10px] text-muted-foreground">{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 14-day macro charts */}
      {fourteenDayData.some(d => d.calories > 0) && (
        <div className="space-y-4">
          {[
            { key: "calories", label: "Calories (14 days)", goal: calorieTarget, color: "hsl(var(--primary))", unit: "kcal" },
            { key: "protein", label: "Protein (14 days)", goal: proteinGoal, color: MACRO_COLORS.protein, unit: "g" },
            { key: "carbs", label: "Carbs (14 days)", goal: carbsGoal, color: MACRO_COLORS.carbs, unit: "g" },
            { key: "fat", label: "Fat (14 days)", goal: fatGoal, color: MACRO_COLORS.fat, unit: "g" },
          ].map(({ key, label, goal, color, unit }) => (
            <Card key={key}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />{label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={fourteenDayData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="label" tick={{ fontSize: 9 }} interval={1} />
                    <YAxis tick={{ fontSize: 9 }} />
                    <RechartTooltip formatter={(v: any) => [`${v} ${unit}`]} />
                    <ReferenceLine y={goal} stroke={color} strokeDasharray="4 2" opacity={0.6} />
                    <Bar dataKey={key} fill={color} radius={[3, 3, 0, 0]} maxBarSize={20} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                  <span className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: color }} />
                  Goal: {goal}{unit}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Today's macro donut chart */}
      {totals.calories > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />Macro Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie data={donutData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} dataKey="value" paddingAngle={3}>
                  {donutData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <RechartTooltip formatter={(v: any, name: any) => [`${v} kcal`, name]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-4 text-xs mt-1">
              {donutData.map(d => (
                <span key={d.name} className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                  {d.name}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add food dialog */}
      {selectedFood && (
        <AddFoodDialog
          food={selectedFood}
          onAdd={(mealType, qty) => addToLog.mutate({ food: selectedFood, mealType, qty })}
          onClose={() => setSelectedFood(null)}
        />
      )}
    </div>
  );
};

export default FoodDatabase;
