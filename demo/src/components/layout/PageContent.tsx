import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageContentProps {
  children: ReactNode;
  className?: string;
}

const PageContent = ({ children, className }: PageContentProps) => (
  <div className={cn("animate-fade-in", className)}>{children}</div>
);

export default PageContent;
