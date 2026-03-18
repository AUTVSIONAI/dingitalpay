import { cn } from "@/lib/utils";

interface TabsPeriodSelectorProps {
  periods: { label: string; value: string }[];
  selected: string;
  onSelect: (value: string) => void;
  className?: string;
}

const defaultPeriods = [
  { label: "Hoje", value: "today" },
  { label: "Ontem", value: "yesterday" },
  { label: "7 dias", value: "7d" },
  { label: "Mês", value: "month" },
  { label: "Ano", value: "year" },
  { label: "Total", value: "total" },
];

const TabsPeriodSelector = ({
  periods = defaultPeriods,
  selected,
  onSelect,
  className,
}: TabsPeriodSelectorProps) => {
  return (
    <div className={cn("inline-flex items-center gap-0.5 rounded-lg bg-muted p-1", className)}>
      {periods.map((period) => (
        <button
          key={period.value}
          onClick={() => onSelect(period.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
            selected === period.value
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {period.label}
        </button>
      ))}
    </div>
  );
};

export { defaultPeriods };
export default TabsPeriodSelector;
