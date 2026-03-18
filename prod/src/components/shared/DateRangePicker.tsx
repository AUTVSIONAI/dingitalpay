import { useMemo, useState } from "react";
import { endOfMonth, endOfToday, format, startOfMonth, startOfToday, subDays, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface DateRangePickerProps {
  value?: DateRange;
  onChange?: (range: DateRange | undefined) => void;
  placeholder?: string;
  className?: string;
}

const DateRangePicker = ({ value, onChange, placeholder = "Selecionar período", className }: DateRangePickerProps) => {
  const today = useMemo(() => startOfToday(), []);
  const defaultRange = useMemo<DateRange>(() => ({ from: startOfMonth(today), to: endOfToday() }), [today]);
  const [internalValue, setInternalValue] = useState<DateRange | undefined>(value ?? defaultRange);
  const [open, setOpen] = useState(false);
  const range = value ?? internalValue;
  const setRange = onChange ?? setInternalValue;

  const presets: Array<{ label: string; range: DateRange }> = useMemo(() => {
    const yesterday = subDays(today, 1);
    const currentMonthStart = startOfMonth(today);
    const lastMonthDate = subMonths(today, 1);
    return [
      { label: "Hoje", range: { from: today, to: endOfToday() } },
      { label: "Ontem", range: { from: yesterday, to: yesterday } },
      { label: "Últimos 7 dias", range: { from: subDays(today, 6), to: endOfToday() } },
      { label: "Últimos 30 dias", range: { from: subDays(today, 29), to: endOfToday() } },
      { label: "Este mês", range: { from: currentMonthStart, to: endOfToday() } },
      { label: "Mês passado", range: { from: startOfMonth(lastMonthDate), to: endOfMonth(lastMonthDate) } },
    ];
  }, [today]);

  const activePresetLabel = useMemo(() => {
    if (!range?.from || !range?.to) return null;
    const currentFrom = range.from.getTime();
    const currentTo = range.to.getTime();
    const matchedPreset = presets.find((preset) => (
      preset.range.from?.getTime() === currentFrom &&
      preset.range.to?.getTime() === currentTo
    ));
    return matchedPreset?.label ?? null;
  }, [presets, range]);

  const handlePresetSelect = (nextRange: DateRange) => {
    setRange(nextRange);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-[280px] justify-start text-left font-normal",
            !range?.from && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {range?.from ? (
            range.to ? (
              <>
                {format(range.from, "dd/MM/yyyy")} – {format(range.to, "dd/MM/yyyy")}
              </>
            ) : (
              format(range.from, "dd/MM/yyyy")
            )
          ) : (
            <span>{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex">
          <div className="hidden sm:flex w-52 shrink-0 flex-col gap-1 border-r border-border bg-muted/20 p-3">
            {presets.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant={activePresetLabel === preset.label ? "secondary" : "ghost"}
                className={cn(
                  "justify-start h-9 px-3 text-sm font-normal",
                  activePresetLabel === preset.label && "bg-primary/15 text-primary hover:bg-primary/20 hover:text-primary"
                )}
                onClick={() => handlePresetSelect(preset.range)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <Calendar
            initialFocus
            mode="range"
            locale={ptBR}
            defaultMonth={range?.from}
            selected={range}
            onSelect={setRange}
            numberOfMonths={2}
            className={cn("p-3 pointer-events-auto")}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default DateRangePicker;
