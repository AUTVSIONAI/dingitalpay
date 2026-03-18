import { cn } from "@/lib/utils";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  title?: string;
  description?: string;
  className?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

const EmptyState = ({
  title = "Nenhum dado encontrado",
  description = "Não há itens para exibir no momento.",
  className,
  icon,
  action,
}: EmptyStateProps) => {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted/60 mb-3 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:text-muted-foreground">
        {icon || <Inbox className="h-4 w-4 text-muted-foreground" />}
      </div>
      <h3 className="text-sm font-medium text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-sm">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
};

export default EmptyState;
