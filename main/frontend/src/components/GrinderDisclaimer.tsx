import { Info } from "lucide-react";

export function GrinderDisclaimer() {
  return (
    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
      <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
      <p>
        Grind settings calibrated for <strong>Baratza Sette 270</strong>{" "}
        (macro 1–31, micro A–I). Support for other grinders coming soon.
      </p>
    </div>
  );
}