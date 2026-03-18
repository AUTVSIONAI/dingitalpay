import { useCallback, useState, useRef } from "react";
import { Upload, X, FileIcon, Image as ImageIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface FileUploaderProps {
  accept?: string;
  multiple?: boolean;
  maxSizeMB?: number;
  onChange?: (files: File[]) => void;
  onReject?: (rejected: Array<{ file: File; reason: "size" }>) => void;
  className?: string;
}

const FileUploader = ({ accept, multiple = false, maxSizeMB = 10, onChange, onReject, className }: FileUploaderProps) => {
  const [files, setFiles] = useState<File[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return;
    const maxBytes = maxSizeMB * 1024 * 1024;
    const entries = Array.from(newFiles);
    const rejected = entries.filter((f) => f.size > maxBytes).map((file) => ({ file, reason: "size" as const }));
    if (rejected.length) onReject?.(rejected);
    const valid = entries.filter((f) => f.size <= maxBytes);
    const updated = multiple ? [...files, ...valid] : valid.slice(0, 1);
    setFiles(updated);
    onChange?.(updated);
  }, [files, multiple, maxSizeMB, onChange, onReject]);

  const removeFile = (index: number) => {
    const updated = files.filter((_, i) => i !== index);
    setFiles(updated);
    onChange?.(updated);
  };

  const isImage = (file: File) => file.type.startsWith("image/");

  return (
    <div className={cn("space-y-3", className)}>
      <div
        className={cn(
          "relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 transition-colors cursor-pointer",
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/40"
        )}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Arraste arquivos aqui ou <span className="text-primary font-medium">clique para selecionar</span>
        </p>
        <p className="text-xs text-muted-foreground">Máx. {maxSizeMB}MB por arquivo</p>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          multiple={multiple}
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((file, i) => (
            <div key={i} className="flex items-center gap-3 rounded-md border border-border bg-card p-2">
              {isImage(file) ? (
                <ImageIcon className="h-5 w-5 text-muted-foreground shrink-0" />
              ) : (
                <FileIcon className="h-5 w-5 text-muted-foreground shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={(e) => { e.stopPropagation(); removeFile(i); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default FileUploader;
