import { useState } from "react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4",
  "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
  "#14b8a6", "#84cc16", "#000000", "#6b7280", "#ffffff",
];

interface ColorPickerProps {
  value?: string;
  onChange?: (color: string) => void;
  label?: string;
  className?: string;
}

const ColorPicker = ({ value = "#3b82f6", onChange, label, className }: ColorPickerProps) => {
  const [color, setColor] = useState(value);
  const current = value ?? color;

  const handleChange = (c: string) => {
    setColor(c);
    onChange?.(c);
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      {label && <p className="text-sm font-medium text-foreground">{label}</p>}
      <Popover>
        <PopoverTrigger asChild>
          <button className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 hover:bg-accent transition-colors">
            <div className="h-6 w-6 rounded-md border border-border shrink-0" style={{ backgroundColor: current }} />
            <span className="text-sm font-mono text-foreground">{current}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-3">
          <div className="space-y-3">
            <div className="grid grid-cols-5 gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  className={cn(
                    "h-7 w-7 rounded-md border-2 transition-transform hover:scale-110",
                    current === c ? "border-primary ring-2 ring-primary/30" : "border-border"
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => handleChange(c)}
                />
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-md border border-border shrink-0" style={{ backgroundColor: current }} />
              <Input
                value={current}
                onChange={(e) => handleChange(e.target.value)}
                className="font-mono text-sm h-8"
                maxLength={7}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default ColorPicker;
