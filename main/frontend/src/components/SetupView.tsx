import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GrindInput } from "@/components/GrindInput";

interface SetupViewProps {
  onStart: (coffeeName: string, macro: number, micro: string, targetTime: number) => void;
}

export function SetupView({ onStart }: SetupViewProps) {
  const [coffeeName, setCoffeeName] = useState("");
  const [macro, setMacro] = useState(15);
  const [micro, setMicro] = useState("E");
  const [targetTime, setTargetTime] = useState(30);

  return (
    <Card>
      <CardHeader>
        <CardTitle>New Coffee</CardTitle>
        <CardDescription>
          Enter your coffee name and estimate a starting grind to begin the dial-in process.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <label className="text-sm font-medium mb-1.5 block text-muted-foreground">
            Coffee Name
          </label>
          <Input
            placeholder="e.g., Ethiopia Yirgacheffe"
            value={coffeeName}
            onChange={(e) => setCoffeeName(e.target.value)}
          />
        </div>

        <div>
          <label className="text-sm font-medium mb-1.5 block text-muted-foreground">
            Target Shot Time (seconds)
          </label>
          <Input
            type="number"
            value={targetTime}
            onChange={(e) => setTargetTime(Number(e.target.value))}
            min={15}
            max={60}
          />
        </div>

        <GrindInput macro={macro} micro={micro} onChange={(m, mi) => { setMacro(m); setMicro(mi); }} />

        <Button
          variant="coffee"
          className="w-full"
          disabled={!coffeeName.trim()}
          onClick={() => onStart(coffeeName.trim(), macro, micro, targetTime)}
        >
          Start Dialing In
        </Button>
      </CardContent>
    </Card>
  );
}