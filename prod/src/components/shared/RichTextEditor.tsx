import { useState, useCallback } from "react";
import { Bold, Italic, Underline, List, ListOrdered, AlignLeft, AlignCenter, AlignRight, Link, Heading2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface RichTextEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

const TOOLBAR_ITEMS = [
  { icon: Bold, command: "bold", label: "Negrito" },
  { icon: Italic, command: "italic", label: "Itálico" },
  { icon: Underline, command: "underline", label: "Sublinhado" },
  { icon: Heading2, command: "formatBlock:h2", label: "Título" },
  "separator",
  { icon: List, command: "insertUnorderedList", label: "Lista" },
  { icon: ListOrdered, command: "insertOrderedList", label: "Lista numerada" },
  "separator",
  { icon: AlignLeft, command: "justifyLeft", label: "Alinhar esquerda" },
  { icon: AlignCenter, command: "justifyCenter", label: "Centralizar" },
  { icon: AlignRight, command: "justifyRight", label: "Alinhar direita" },
  "separator",
  { icon: Link, command: "createLink", label: "Link" },
] as const;

const RichTextEditor = ({ value = "", onChange, placeholder = "Escreva algo...", className, minHeight = "150px" }: RichTextEditorProps) => {
  const [isFocused, setIsFocused] = useState(false);

  const execCommand = useCallback((command: string) => {
    if (command.startsWith("formatBlock:")) {
      document.execCommand("formatBlock", false, command.split(":")[1]);
    } else if (command === "createLink") {
      const url = prompt("URL do link:");
      if (url) document.execCommand("createLink", false, url);
    } else {
      document.execCommand(command, false);
    }
  }, []);

  return (
    <div className={cn(
      "rounded-lg border transition-colors",
      isFocused ? "border-ring ring-2 ring-ring/20" : "border-border",
      className
    )}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/30 p-1 rounded-t-lg">
        {TOOLBAR_ITEMS.map((item, i) => {
          if (item === "separator") return <Separator key={i} orientation="vertical" className="h-6 mx-1" />;
          const { icon: Icon, command, label } = item;
          return (
            <Tooltip key={command}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onMouseDown={(e) => { e.preventDefault(); execCommand(command); }}
                >
                  <Icon className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p>{label}</p></TooltipContent>
            </Tooltip>
          );
        })}
      </div>

      {/* Editable area */}
      <div
        contentEditable
        suppressContentEditableWarning
        className="px-3 py-2 text-sm text-foreground outline-none prose prose-sm max-w-none [&>*]:my-1"
        style={{ minHeight }}
        dangerouslySetInnerHTML={{ __html: value }}
        onFocus={() => setIsFocused(true)}
        onBlur={(e) => { setIsFocused(false); onChange?.(e.currentTarget.innerHTML); }}
        data-placeholder={placeholder}
      />
    </div>
  );
};

export default RichTextEditor;
