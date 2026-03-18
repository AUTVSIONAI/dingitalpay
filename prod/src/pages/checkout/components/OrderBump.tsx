import { Checkbox } from "@/components/ui/checkbox";
import { CirclePlus, Tag } from "lucide-react";
import { motion } from "framer-motion";

interface OrderBumpItem {
  productId: string;
  name: string;
  shortDescription?: string | null;
  price: number;
  discountEnabled: boolean;
  discountPercentage: number;
}

interface OrderBumpProps {
  items: OrderBumpItem[];
  acceptedIds: string[];
  onAcceptChange: (productId: string, accepted: boolean) => void;
  primaryColor?: string;
}

const withAlpha = (color: string, alpha: number) => {
  if (/^#([0-9a-f]{6}|[0-9a-f]{3})$/i.test(color)) {
    const normalized = color.length === 4
      ? `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`
      : color;
    const hexAlpha = Math.round(Math.max(0, Math.min(1, alpha)) * 255)
      .toString(16)
      .padStart(2, "0");
    return `${normalized}${hexAlpha}`;
  }

  return color;
};

const OrderBump = ({ items, acceptedIds, onAcceptChange, primaryColor = "#8B5CF6" }: OrderBumpProps) => {
  if (items.length === 0) return null;

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const accepted = acceptedIds.includes(item.productId);
        const finalPrice = item.discountEnabled
          ? item.price * (1 - item.discountPercentage / 100)
          : item.price;
        const borderColor = withAlpha(primaryColor, accepted ? 0.9 : 0.45);
        const backgroundColor = withAlpha(primaryColor, accepted ? 0.08 : 0.04);

        return (
          <motion.div
            key={item.productId}
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className={`rounded-xl border-2 p-4 transition-colors cursor-pointer ${accepted ? "" : "border-dashed"}`}
            style={{ borderColor, backgroundColor }}
            onClick={() => onAcceptChange(item.productId, !accepted)}
            role="button"
            tabIndex={0}
            aria-pressed={accepted}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onAcceptChange(item.productId, !accepted);
              }
            }}
          >
            <div className="flex items-start gap-3">
              <Checkbox
                checked={accepted}
                onCheckedChange={(value) => onAcceptChange(item.productId, value === true)}
                onClick={(event) => event.stopPropagation()}
                className="mt-0.5"
                style={{ borderColor, backgroundColor: accepted ? primaryColor : undefined }}
              />
              <div className="flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <CirclePlus className="h-4 w-4" style={{ color: primaryColor }} />
                  <span className="font-bold text-sm text-foreground">
                    Adicione também {item.name} por R$ {finalPrice.toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                {item.shortDescription && (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {item.shortDescription}
                  </p>
                )}
                {item.discountEnabled && (
                  <div className="flex items-center gap-3 mt-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Tag className="h-3 w-3" style={{ color: primaryColor }} />
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold" style={{ color: primaryColor }}>
                          Economize {item.discountPercentage}%
                        </span>
                        <span className="text-muted-foreground">de</span>
                        <span className="text-muted-foreground line-through">
                          R$ {item.price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className="text-muted-foreground">por</span>
                        <span className="font-semibold" style={{ color: primaryColor }}>
                          R$ {finalPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
};

export default OrderBump;
