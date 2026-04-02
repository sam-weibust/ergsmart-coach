import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Copy, SplitSquareVertical } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const DISTANCES = [
  { value: "500", label: "500m", splits: 1 },
  { value: "1000", label: "1K", splits: 2 },
  { value: "2000", label: "2K", splits: 4 },
  { value: "5000", label: "5K", splits: 10 },
  { value: "6000", label: "6K", splits: 12 },
];

const STRATEGIES = [
  { value: "even", label: "Even Split" },
  { value: "negative", label: "2% Negative Split" },
  { value: "positive", label: "2% Positive Split" },
  { value: "sprint_finish", label: "Sprint Finish (last 500m 3% faster)" },
];

const parseTime = (t: string): number | null => {
  const parts = t.trim().split(":");
  if (parts.length === 2) {
    const m = parseInt(parts[0]);
    const s = parseFloat(parts[1]);
    if (isNaN(m) || isNaN(s)) return null;
    return m * 60 + s;
  }
  const s = parseFloat(t);
  return isNaN(s) ? null : s;
};

const fmt = (s: number): string => {
  const m = Math.floor(s / 60);
  const sec = s - m * 60;
  return `${m}:${sec.toFixed(1).padStart(4, "0")}`;
};

export const SplitCalculator = () => {
  const { toast } = useToast();
  const [targetTime, setTargetTime] = useState("");
  const [distance, setDistance] = useState("2000");
  const [strategy, setStrategy] = useState("even");
  const [splits, setSplits] = useState<{ piece: number; target: string; cumulative: string; deviation: number }[]>([]);

  const calculate = () => {
    const totalSec = parseTime(targetTime);
    const dist = DISTANCES.find(d => d.value === distance);
    if (!totalSec || !dist) return;

    const numSplits = dist.splits;
    const avgPer500 = totalSec / numSplits;
    const result: typeof splits = [];

    for (let i = 0; i < numSplits; i++) {
      let splitTime = avgPer500;
      let deviation = 0;

      if (strategy === "negative") {
        // Start 2% slower, end 2% faster — linear ramp
        const factor = 1.02 - (0.04 * i) / (numSplits - 1 || 1);
        splitTime = avgPer500 * factor;
        deviation = (factor - 1) * 100;
      } else if (strategy === "positive") {
        const factor = 0.98 + (0.04 * i) / (numSplits - 1 || 1);
        splitTime = avgPer500 * factor;
        deviation = (factor - 1) * 100;
      } else if (strategy === "sprint_finish") {
        if (i === numSplits - 1) {
          splitTime = avgPer500 * 0.97;
          deviation = -3;
        } else {
          // Spread the extra time across other splits
          const extra = avgPer500 * 0.03 / (numSplits - 1 || 1);
          splitTime = avgPer500 + extra;
          deviation = (extra / avgPer500) * 100;
        }
      }

      const cumSec = result.reduce((s, r) => s + parseTime(r.target)!, 0) + splitTime;
      result.push({
        piece: i + 1,
        target: fmt(splitTime),
        cumulative: fmt(cumSec),
        deviation: Math.round(deviation * 10) / 10,
      });
    }

    setSplits(result);
  };

  const copyToNotes = () => {
    const dist = DISTANCES.find(d => d.value === distance);
    const lines = [
      `Split Plan: ${dist?.label} — ${targetTime} (${STRATEGIES.find(s => s.value === strategy)?.label})`,
      ...splits.map(s => `  500m #${s.piece}: ${s.target} (cum: ${s.cumulative})`),
    ];
    navigator.clipboard.writeText(lines.join("\n"));
    toast({ title: "Copied!", description: "Split plan copied to clipboard." });
  };

  return (
    <Card className="shadow-card border-border">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SplitSquareVertical className="h-5 w-5 text-primary" />
          Split Pacing Calculator
        </CardTitle>
        <CardDescription>Plan your 500m splits for any distance and pacing strategy</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Target Time (MM:SS.t)</Label>
            <Input placeholder="7:00.0" value={targetTime} onChange={e => setTargetTime(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Distance</Label>
            <Select value={distance} onValueChange={setDistance}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DISTANCES.map(d => <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Strategy</Label>
            <Select value={strategy} onValueChange={setStrategy}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STRATEGIES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button onClick={calculate} className="w-full">Calculate Splits</Button>
          </div>
        </div>

        {splits.length > 0 && (
          <div className="space-y-3">
            <div className="rounded-xl border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="w-[80px]">500m #</TableHead>
                    <TableHead>Target Split</TableHead>
                    <TableHead>Cumulative</TableHead>
                    <TableHead className="w-[100px]">Deviation</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {splits.map(s => (
                    <TableRow key={s.piece}>
                      <TableCell className="font-mono">{s.piece}</TableCell>
                      <TableCell className="font-mono font-bold">{s.target}</TableCell>
                      <TableCell className="font-mono text-muted-foreground">{s.cumulative}</TableCell>
                      <TableCell>
                        {s.deviation === 0 ? (
                          <Badge variant="secondary" className="text-xs">Even</Badge>
                        ) : s.deviation < 0 ? (
                          <Badge className="bg-green-500/10 text-green-600 border-green-500/20 text-xs">{s.deviation}%</Badge>
                        ) : (
                          <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/20 text-xs">+{s.deviation}%</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button variant="outline" size="sm" onClick={copyToNotes} className="gap-1.5">
              <Copy className="h-3.5 w-3.5" /> Copy to Notes
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
