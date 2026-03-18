import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Save, Image as ImageIcon, Loader2, Trash2 } from "lucide-react";
import { useUpdateProduct, useUploadProductImage } from "@/hooks/useProducts";
import { maskCurrency, unmaskCurrency } from "@/lib/masks";

interface ProductForTab {
  id: string;
  name: string;
  shortDescription?: string;
  longDescription?: string;
  price: number;
  type: string;
  status: string;
  imageUrl?: string;
  warrantyDays?: number;
  deliveryType?: string;
}

interface Props {
  product: ProductForTab;
}

const productTypeLabels: Record<string, string> = {
  course: "Curso",
  ebook: "E-book",
  physical: "Produto Físico",
};

const ProductDetailsTab = ({ product }: Props) => {
  const updateProduct = useUpdateProduct();
  const uploadImage = useUploadProductImage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    name: product.name,
    shortDescription: product.shortDescription || "",
    longDescription: product.longDescription || "",
    price: maskCurrency(String(Math.round(product.price * 100))),
    status: product.status,
    warranty: product.warrantyDays ?? 7,
    deliveryType: product.deliveryType || (product.type === "physical" ? "manual" : "instant"),
  });

  const handleSave = () => {
    updateProduct.mutate({
      id: product.id,
      updates: {
        name: form.name,
        short_description: form.shortDescription,
        long_description: form.longDescription,
        price: unmaskCurrency(form.price),
        status: form.status as any,
        warranty_days: form.warranty,
        delivery_type: form.deliveryType,
      },
    });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    uploadImage.mutate({ file, productId: product.id });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Informações Básicas</CardTitle>
          <CardDescription>Nome, descrição e tipo do produto</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="prod-name">Nome do produto</Label>
            <Input id="prod-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prod-short">Descrição curta</Label>
            <Input id="prod-short" value={form.shortDescription} onChange={(e) => setForm({ ...form, shortDescription: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prod-long">Descrição completa</Label>
            <Textarea id="prod-long" rows={5} value={form.longDescription} onChange={(e) => setForm({ ...form, longDescription: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Input value={productTypeLabels[product.type] || product.type} disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground">O tipo do produto não pode ser alterado após a criação.</p>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="draft">Rascunho</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Imagem do Produto</CardTitle>
          <CardDescription>Thumbnail exibida na vitrine e checkout</CardDescription>
        </CardHeader>
        <CardContent>
          <input type="file" ref={fileInputRef} accept="image/*" className="hidden" onChange={handleImageUpload} />
          {product.imageUrl && product.imageUrl !== "" ? (
            <div className="relative inline-block">
              <img src={product.imageUrl} alt={product.name} className="rounded-lg aspect-square object-cover w-full max-w-xs" />
              <div className="flex gap-2 mt-2">
                <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploadImage.isPending}>
                  {uploadImage.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando...</> : "Trocar imagem"}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => updateProduct.mutate({ id: product.id, updates: { image_url: "" } })}
                  disabled={updateProduct.isPending}
                >
                  <Trash2 className="h-4 w-4 mr-1" />Remover
                </Button>
              </div>
            </div>
          ) : (
            <div
              className="border-2 border-dashed border-border rounded-lg p-8 flex flex-col items-center gap-3 text-center cursor-pointer hover:border-primary/50 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadImage.isPending ? (
                <Loader2 className="h-10 w-10 text-muted-foreground animate-spin" />
              ) : (
                <ImageIcon className="h-10 w-10 text-muted-foreground" />
              )}
              <p className="text-sm text-muted-foreground">Arraste uma imagem ou clique para fazer upload</p>
              <Button variant="outline" size="sm" disabled={uploadImage.isPending}>Selecionar imagem</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Preço & Garantia</CardTitle>
          <CardDescription>Configurações de valor e garantia</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="prod-price">Preço</Label>
              <Input id="prod-price" inputMode="numeric" placeholder="R$ 0,00" value={form.price} onChange={(e) => setForm({ ...form, price: maskCurrency(e.target.value) })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prod-warranty">Garantia (dias)</Label>
              <Input id="prod-warranty" type="number" value={form.warranty} onChange={(e) => setForm({ ...form, warranty: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={updateProduct.isPending}>
          {updateProduct.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando...</> : <><Save className="h-4 w-4 mr-2" />Salvar alterações</>}
        </Button>
      </div>
    </div>
  );
};

export default ProductDetailsTab;
