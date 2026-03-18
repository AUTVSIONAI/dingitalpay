import { cn } from "@/lib/utils";
import { CheckCircle2 } from "lucide-react";

export interface TemplateOption {
  id: string;
  label: string;
  description?: string;
  preview?: React.ReactNode;
  icon?: React.ReactNode;
}

interface TemplatePickerProps {
  templates: TemplateOption[];
  value?: string;
  onChange?: (id: string) => void;
  columns?: 2 | 3 | 4;
  className?: string;
}

const TemplatePicker = ({ templates, value, onChange, columns = 3, className }: TemplatePickerProps) => {
  const gridCols = {
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 md:grid-cols-3",
    4: "grid-cols-2 sm:grid-cols-3 md:grid-cols-4",
  };

  return (
    <div className={cn("grid gap-3", gridCols[columns], className)}>
      {templates.map((t) => {
        const isActive = value === t.id;
        return (
          <button
            key={t.id}
            onClick={() => onChange?.(t.id)}
            className={cn(
              "relative flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-left transition-all hover:shadow-md",
              isActive
                ? "border-primary bg-primary/5 shadow-sm"
                : "border-border bg-card hover:border-muted-foreground/30"
            )}
          >
            {isActive && (
              <div className="absolute top-2 right-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
              </div>
            )}
            {t.preview ? (
              <div className="w-full aspect-video rounded-md overflow-hidden border border-border bg-muted flex items-center justify-center">
                {t.preview}
              </div>
            ) : t.icon ? (
              <div className="h-12 w-12 rounded-md bg-muted flex items-center justify-center text-muted-foreground">
                {t.icon}
              </div>
            ) : null}
            <div className="w-full">
              <p className="text-sm font-medium text-foreground">{t.label}</p>
              {t.description && <p className="text-xs text-muted-foreground mt-0.5">{t.description}</p>}
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default TemplatePicker;
