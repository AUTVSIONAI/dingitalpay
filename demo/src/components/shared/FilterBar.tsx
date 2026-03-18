import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface FilterOption {
  label: string;
  value: string;
}

export interface FilterDef {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
}

interface FilterBarProps {
  searchPlaceholder?: string;
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  filters?: FilterDef[];
  actions?: ReactNode;
  actionsClassName?: string;
  className?: string;
}

const FilterBar = ({
  searchPlaceholder = "Buscar...",
  searchValue,
  onSearchChange,
  filters,
  actions,
  actionsClassName,
  className,
}: FilterBarProps) => {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-center gap-3 mb-4", className)}>
      {onSearchChange && (
        <div className="relative flex-1 min-w-0 sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>
      )}
      {filters?.map((f) => (
        <Select key={f.label} value={f.value} onValueChange={f.onChange}>
          <SelectTrigger className="w-[150px] h-9 text-sm">
            <SelectValue placeholder={f.label} />
          </SelectTrigger>
          <SelectContent>
            {f.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
      {actions && <div className={cn("flex items-center gap-2 ml-auto", actionsClassName)}>{actions}</div>}
    </div>
  );
};

export default FilterBar;
