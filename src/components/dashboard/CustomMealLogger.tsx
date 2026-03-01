import { useState, useRef, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PencilLine, Plus, ScanBarcode, Camera, Loader2, X } from "lucide-react";

interface CustomMealLoggerProps {
  profileId: string;
}

const CustomMealLogger = ({ profileId }: CustomMealLoggerProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scannerActive, setScannerActive] = useState(false);
  const [parsingLabel, setParsingLabel] = useState(false);

  const scannerRef = useRef<HTMLDivElement>(null);
  const html5QrCodeRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [meal, setMeal] = useState({
    meal_type: "Snack",
    description: "",
    calories: "",
    protein: "",
    carbs: "",
    fats: "",
  });

  const resetForm = () => {
    setMeal({ meal_type: "Snack", description: "", calories: "", protein: "", carbs: "", fats: "" });
  };

  const stopScanner = useCallback(async () => {
    if (html5QrCodeRef.current) {
      try {
        const state = html5QrCodeRef.current.getState();
        // State 2 = SCANNING
        if (state === 2) {
          await html5QrCodeRef.current.stop();
        }
      } catch (e) {
        console.log("Scanner stop error (safe to ignore):", e);
      }
      try {
        html5QrCodeRef.current.clear();
      } catch (e) {
        // ignore
      }
      html5QrCodeRef.current = null;
    }
    setScannerActive(false);
  }, []);

  // Cleanup scanner on unmount or dialog close
  useEffect(() => {
    if (!open) {
      stopScanner();
    }
  }, [open, stopScanner]);

  const lookupBarcode = async (barcode: string) => {
    setScanning(true);
    try {
      const response = await fetch(
        `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`
      );
      const data = await response.json();

      if (data.status === 1 && data.product) {
        const p = data.product;
        const nutrients = p.nutriments || {};
        setMeal({
          ...meal,
          description: p.product_name || `Barcode: ${barcode}`,
          calories: String(Math.round(nutrients["energy-kcal_serving"] || nutrients["energy-kcal_100g"] || 0)),
          protein: String(Math.round(nutrients.proteins_serving || nutrients.proteins_100g || 0)),
          carbs: String(Math.round(nutrients.carbohydrates_serving || nutrients.carbohydrates_100g || 0)),
          fats: String(Math.round(nutrients.fat_serving || nutrients.fat_100g || 0)),
        });
        toast({ title: "Product found!", description: p.product_name || barcode });
      } else {
        toast({ title: "Product not found", description: "Try entering macros manually.", variant: "destructive" });
      }
    } catch (error) {
      console.error("Barcode lookup error:", error);
      toast({ title: "Lookup failed", description: "Could not reach food database.", variant: "destructive" });
    } finally {
      setScanning(false);
      await stopScanner();
    }
  };

  const startBarcodeScanner = async () => {
    if (scannerActive) {
      await stopScanner();
      return;
    }

    try {
      const { Html5Qrcode } = await import("html5-qrcode");

      // Small delay to ensure DOM element exists
      await new Promise((r) => setTimeout(r, 100));

      if (!scannerRef.current) return;

      const scannerId = "barcode-scanner-region";
      scannerRef.current.id = scannerId;

      const html5QrCode = new Html5Qrcode(scannerId);
      html5QrCodeRef.current = html5QrCode;
      setScannerActive(true);

      await html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (decodedText: string) => {
          lookupBarcode(decodedText);
        },
        () => {} // ignore scan failures
      );
    } catch (error) {
      console.error("Scanner error:", error);
      setScannerActive(false);
      toast({
        title: "Camera unavailable",
        description: "Please allow camera access or enter the barcode manually.",
        variant: "destructive",
      });
    }
  };

  const handleLabelPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsingLabel(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]); // strip data:... prefix
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const { data, error } = await supabase.functions.invoke("parse-nutrition-label", {
        body: { imageBase64: base64, mimeType: file.type },
      });

      if (error) throw error;

      setMeal({
        ...meal,
        description: data.name || "Scanned food",
        calories: String(data.calories || 0),
        protein: String(data.protein || 0),
        carbs: String(data.carbs || 0),
        fats: String(data.fats || 0),
      });
      toast({ title: "Label parsed!", description: data.name || "Nutrition info extracted" });
    } catch (error) {
      console.error("Label parse error:", error);
      toast({ title: "Could not parse label", description: "Try entering macros manually.", variant: "destructive" });
    } finally {
      setParsingLabel(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const saveMeal = async () => {
    if (!meal.description) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("meal_plans").insert({
        user_id: profileId,
        meal_type: meal.meal_type,
        description: meal.description,
        calories: parseInt(meal.calories) || 0,
        protein: parseFloat(meal.protein) || 0,
        carbs: parseFloat(meal.carbs) || 0,
        fats: parseFloat(meal.fats) || 0,
      });
      if (error) throw error;
      toast({ title: "Meal logged! ✅" });
      setOpen(false);
      resetForm();
      queryClient.invalidateQueries({ queryKey: ["saved-meal-plans"] });
    } catch (error) {
      toast({ title: "Error logging meal", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const [manualBarcode, setManualBarcode] = useState("");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <PencilLine className="h-4 w-4 mr-1" />
          Log Meal
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Log a Meal</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="manual" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="manual">Manual</TabsTrigger>
            <TabsTrigger value="barcode">Barcode</TabsTrigger>
            <TabsTrigger value="label">Photo</TabsTrigger>
          </TabsList>

          {/* Barcode Tab */}
          <TabsContent value="barcode" className="space-y-3">
            <Card>
              <CardContent className="pt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Scan a barcode to auto-fill nutrition info from Open Food Facts.
                </p>

                <div ref={scannerRef} className="w-full rounded-lg overflow-hidden" />

                <Button
                  onClick={startBarcodeScanner}
                  variant={scannerActive ? "destructive" : "secondary"}
                  className="w-full"
                  disabled={scanning}
                >
                  {scannerActive ? (
                    <><X className="h-4 w-4 mr-1" />Stop Scanner</>
                  ) : (
                    <><ScanBarcode className="h-4 w-4 mr-1" />Open Camera Scanner</>
                  )}
                </Button>

                <div className="flex gap-2">
                  <Input
                    placeholder="Or type barcode number..."
                    value={manualBarcode}
                    onChange={(e) => setManualBarcode(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && manualBarcode && lookupBarcode(manualBarcode)}
                  />
                  <Button
                    size="sm"
                    onClick={() => manualBarcode && lookupBarcode(manualBarcode)}
                    disabled={scanning || !manualBarcode}
                  >
                    {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lookup"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Photo/Label Tab */}
          <TabsContent value="label" className="space-y-3">
            <Card>
              <CardContent className="pt-4 space-y-3">
                <p className="text-sm text-muted-foreground">
                  Take a photo of a nutrition label and AI will extract the macros.
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleLabelPhoto}
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  variant="secondary"
                  className="w-full"
                  disabled={parsingLabel}
                >
                  {parsingLabel ? (
                    <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Analyzing label...</>
                  ) : (
                    <><Camera className="h-4 w-4 mr-1" />Take Photo of Label</>
                  )}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Manual Tab - always visible as fallback */}
          <TabsContent value="manual" className="space-y-0" />
        </Tabs>

        {/* Shared form fields - always visible */}
        <div className="space-y-3 pt-2">
          <div>
            <Label>Meal Type</Label>
            <Select value={meal.meal_type} onValueChange={(v) => setMeal({ ...meal, meal_type: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Breakfast">Breakfast</SelectItem>
                <SelectItem value="Lunch">Lunch</SelectItem>
                <SelectItem value="Dinner">Dinner</SelectItem>
                <SelectItem value="Snack">Snack</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Description</Label>
            <Input
              placeholder="e.g. Grilled chicken salad"
              value={meal.description}
              onChange={(e) => setMeal({ ...meal, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Calories</Label>
              <Input type="number" placeholder="450" value={meal.calories}
                onChange={(e) => setMeal({ ...meal, calories: e.target.value })} />
            </div>
            <div>
              <Label>Protein (g)</Label>
              <Input type="number" placeholder="30" value={meal.protein}
                onChange={(e) => setMeal({ ...meal, protein: e.target.value })} />
            </div>
            <div>
              <Label>Carbs (g)</Label>
              <Input type="number" placeholder="50" value={meal.carbs}
                onChange={(e) => setMeal({ ...meal, carbs: e.target.value })} />
            </div>
            <div>
              <Label>Fats (g)</Label>
              <Input type="number" placeholder="15" value={meal.fats}
                onChange={(e) => setMeal({ ...meal, fats: e.target.value })} />
            </div>
          </div>
          <Button onClick={saveMeal} className="w-full" disabled={!meal.description || saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
            Log Meal
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CustomMealLogger;
