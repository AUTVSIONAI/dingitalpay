import { ShoppingCart, Shield, Lock } from "lucide-react";

interface CheckoutProduct {
  name: string;
  price: number;
  image_url?: string | null;
  imageUrl?: string;
  short_description?: string | null;
  shortDescription?: string;
}

interface OrderSummaryProps {
  product: CheckoutProduct;
  primaryColor?: string;
  orderBumpItems?: {
    productId: string;
    name: string;
    price: number;
    discountEnabled: boolean;
    discountPercentage: number;
  }[];
  acceptedOrderBumpIds?: string[];
}

const OrderSummary = ({
  product,
  primaryColor,
  orderBumpItems = [],
  acceptedOrderBumpIds = [],
}: OrderSummaryProps) => {
  const selectedOrderBumps = orderBumpItems
    .filter((item) => acceptedOrderBumpIds.includes(item.productId))
    .map((item) => ({
      ...item,
      finalPrice: item.discountEnabled
        ? item.price * (1 - item.discountPercentage / 100)
        : item.price,
    }));

  const total = product.price + selectedOrderBumps.reduce((sum, item) => sum + item.finalPrice, 0);

  return (
    <div className="rounded-xl border border-border bg-card shadow-card overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3.5 flex items-center gap-2 text-white" style={{ backgroundColor: primaryColor || "hsl(var(--primary))" }}>
        <ShoppingCart className="h-4 w-4" />
        <h3 className="font-semibold text-sm">Resumo do pedido</h3>
      </div>

      <div className="p-5 space-y-4">
        {/* Product */}
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <ShoppingCart className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground leading-tight">{product.name}</p>
            {(product.short_description || product.shortDescription) && (
              <p className="text-xs text-muted-foreground mt-0.5">{product.short_description || product.shortDescription}</p>
            )}
          </div>
        </div>

        {/* Pricing breakdown */}
        <div className="space-y-2 pt-2 border-t border-border">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Produto</span>
            <span className="text-foreground">R$ {product.price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
          </div>
          {selectedOrderBumps.map((item) => (
            <div key={item.productId} className="flex justify-between text-xs gap-3">
              <span className="text-muted-foreground">{item.name}</span>
              <span className="text-foreground">R$ {item.finalPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          ))}
        </div>

        {/* Total */}
        <div className="flex justify-between items-center pt-3 border-t border-border">
          <span className="text-sm font-semibold text-foreground">Total</span>
          <span className="text-lg font-bold" style={{ color: primaryColor || "hsl(var(--primary))" }}>
            R$ {total.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        {/* Security badges */}
        <div className="pt-3 border-t border-border space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Shield className="h-3.5 w-3.5 text-success" />
            <span>Compra 100% segura</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5 text-success" />
            <span>Dados protegidos com criptografia SSL</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderSummary;
