import { cn } from "@/lib/utils";

type StatusKey = "approved" | "pending" | "in_review" | "refunded" | "chargeback" | "abandoned" | "active" | "inactive" | "draft" | "rejected";

const statusConfig: Record<StatusKey, { label: string; className: string }> = {
  approved: { label: "Aprovada", className: "bg-success/10 text-success border-success/20" },
  active: { label: "Ativo", className: "bg-success/10 text-success border-success/20" },
  pending: { label: "Pendente", className: "bg-warning/10 text-warning border-warning/20" },
  in_review: { label: "Em Análise", className: "bg-info/10 text-info border-info/20" },
  draft: { label: "Rascunho", className: "bg-warning/10 text-warning border-warning/20" },
  refunded: { label: "Reembolsada", className: "bg-info/10 text-info border-info/20" },
  chargeback: { label: "Chargeback", className: "bg-destructive/10 text-destructive border-destructive/20" },
  rejected: { label: "Rejeitado", className: "bg-destructive/10 text-destructive border-destructive/20" },
  abandoned: { label: "Abandonada", className: "bg-muted text-muted-foreground border-border" },
  inactive: { label: "Inativo", className: "bg-muted text-muted-foreground border-border" },
};

interface StatusBadgeProps {
  status: StatusKey;
  className?: string;
}

const StatusBadge = ({ status, className }: StatusBadgeProps) => {
  const config = statusConfig[status] ?? { label: status, className: "bg-muted text-muted-foreground border-border" };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
};

export default StatusBadge;
