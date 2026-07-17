import { cn } from "@/lib/utils";

const MACRO_RANGE = Array.from({ length: 31 }, (_, i) => i + 1);
const MICRO_STEPS = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];

interface GrindInputProps {
  macro: number;
  micro: string;
  onChange: (macro: number, micro: string) => void;
  disabled?: boolean;
}

export function GrindInput({ macro, micro, onChange, disabled }: GrindInputProps) {
  const macroDefault = 15;
  const espm = 11;
  const espmMax = 20;

  return (
    <div className="space-y-3">
      <div>
        <label className="text-sm font-medium mb-1.5 block text-muted-foreground">
          Macro Adjustment
        </label>
        <div className="flex flex-wrap gap-1">
          {MACRO_RANGE.map((m) => {
            const isActive = m === macro;
            const inRange = m >= espm && m <= espmMax;
            return (
              <button
                key={m}
                type="button"
                disabled={disabled}
                onClick={() => onChange(m, micro)}
                className={cn(
                  "w-8 h-8 rounded text-xs font-medium transition-colors",
                  isActive && "bg-coffee text-white",
                  !isActive && inRange && "bg-coffee/10 text-coffee hover:bg-coffee/20",
                  !isActive && !inRange && "bg-muted text-muted-foreground hover:bg-muted/80",
                  disabled && "opacity-50 cursor-not-allowed"
                )}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="text-sm font-medium mb-1.5 block text-muted-foreground">
          Micro Adjustment
        </label>
        <div className="flex gap-1">
          {MICRO_STEPS.map((s) => {
            const isActive = s === micro;
            return (
              <button
                key={s}
                type="button"
                disabled={disabled}
                onClick={() => onChange(macro, s)}
                className={cn(
                  "w-8 h-8 rounded text-xs font-medium transition-colors",
                  isActive && "bg-coffee text-white",
                  !isActive && "bg-coffee/10 text-coffee hover:bg-coffee/20",
                  disabled && "opacity-50 cursor-not-allowed"
                )}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>

      <div className="text-center pt-1">
        <span className="text-2xl font-bold text-coffee">
          {macro}{micro}
        </span>
      </div>
    </div>
  );
}