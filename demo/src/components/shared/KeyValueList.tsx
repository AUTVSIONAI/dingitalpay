import { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface KeyValuePair {
  key: string;
  value: string;
}

interface KeyValueListProps<T extends KeyValuePair = KeyValuePair> {
  value?: T[];
  onChange?: (pairs: T[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  className?: string;
  renderItem?: (args: {
    item: T;
    index: number;
    onItemChange: (patch: Partial<T>) => void;
    onRemove: () => void;
  }) => React.ReactNode;
  createItem?: () => T;
}

const KeyValueList = <T extends KeyValuePair = KeyValuePair>({
  value,
  onChange,
  keyPlaceholder = "Chave",
  valuePlaceholder = "Valor",
  className,
  renderItem,
  createItem,
}: KeyValueListProps<T>) => {
  const emptyItem = useMemo(() => (createItem ? createItem() : { key: "", value: "" }), [createItem]);
  const [pairs, setPairs] = useState<T[]>(value ?? [emptyItem as T]);
  const current = value ?? pairs;

  const update = (updated: T[]) => {
    setPairs(updated);
    onChange?.(updated);
  };

  const handleChange = (index: number, field: "key" | "value", val: string) => {
    const updated = current.map((p, i) => (i === index ? { ...p, [field]: val } : p));
    update(updated);
  };

  const addPair = () => update([...current, createItem ? createItem() : ({ key: "", value: "" } as T)]);

  const removePair = (index: number) => {
    const updated = current.filter((_, i) => i !== index);
    update(updated.length === 0 ? [createItem ? createItem() : ({ key: "", value: "" } as T)] : updated);
  };

  return (
    <div className={cn("space-y-2", className)}>
      {current.map((pair, i) => (
        renderItem ? (
          <div key={i}>
            {renderItem({
              item: pair,
              index: i,
              onItemChange: (patch) => {
                const updated = current.map((currentPair, pairIndex) => (
                  pairIndex === i ? { ...currentPair, ...patch } : currentPair
                ));
                update(updated);
              },
              onRemove: () => removePair(i),
            })}
          </div>
        ) : (
          <div key={i} className="flex items-center gap-2">
            <Input
              placeholder={keyPlaceholder}
              value={pair.key}
              onChange={(e) => handleChange(i, "key", e.target.value)}
              className="flex-1"
            />
            <Input
              placeholder={valuePlaceholder}
              value={pair.value}
              onChange={(e) => handleChange(i, "value", e.target.value)}
              className="flex-1"
            />
            <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={() => removePair(i)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )
      ))}
      <Button variant="outline" size="sm" onClick={addPair} className="gap-1">
        <Plus className="h-3.5 w-3.5" /> Adicionar
      </Button>
    </div>
  );
};

export default KeyValueList;
