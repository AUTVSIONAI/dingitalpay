import { cn } from "@/lib/utils";

interface LoadingStateProps {
  text?: string;
  className?: string;
}

const LoadingState = ({ text = "Carregando...", className }: LoadingStateProps) => {
  return (
    <div className={cn("flex flex-col items-center justify-center min-h-[70vh]", className)}>
      <div className="h-8 w-8 rounded-full border-[3px] border-muted border-t-primary animate-spin mb-3" />
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
};

export default LoadingState;
