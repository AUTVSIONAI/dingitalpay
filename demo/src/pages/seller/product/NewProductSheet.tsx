import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import TemplatePicker from "@/components/shared/TemplatePicker";
import { useCreateProduct } from "@/hooks/useProducts";
import { BookOpen, FileText, Package } from "lucide-react";
import { maskCurrency, unmaskCurrency } from "@/lib/masks";

type ProductType = "ebook" | "course" | "physical";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const productTypes = [
  {
    id: "ebook" as ProductType,
    label: "E-book",
    description: "Produto digital entregue por e-mail ou download",
    icon: <FileText className="h-6 w-6" />,
  },
  {
    id: "course" as ProductType,
    label: "Curso",
    description: "Conteúdo em vídeo com área de membros",
    icon: <BookOpen className="h-6 w-6" />,
  },
  {
    id: "physical" as ProductType,
    label: "Produto Físico",
    description: "Produto com entrega física via correios",
    icon: <Package className="h-6 w-6" />,
  },
];

const NewProductSheet = ({ open, onOpenChange }: Props) => {
  const navigate = useNavigate();
  const createProduct = useCreateProduct();
  const [name, setName] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [price, setPrice] = useState("");
  const [type, setType] = useState<ProductType | "">("");

  const isValid = name.trim() && type && unmaskCurrency(price) > 0;

  const handleCreate = async () => {
    if (!isValid || !type) return;
    const product = await createProduct.mutateAsync({
      name: name.trim(),
      short_description: shortDescription.trim(),
      price: unmaskCurrency(price),
      type: type,
    });
    onOpenChange(false);
    navigate(`/app/products/${product.id}`);
  };

  const handleOpenChange = (v: boolean) => {
    if (!v) {
      setName("");
      setShortDescription("");
      setPrice("");
      setType("");
    }
    onOpenChange(v);
  };

  return (
    <Sheet open={open} onOpenChange={handleOpenChange}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Novo Produto</SheetTitle>
          <SheetDescription>Preencha as informações básicas para criar seu produto.</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 mt-6">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Tipo do produto</Label>
            <TemplatePicker
              templates={productTypes}
              value={type}
              onChange={(id) => setType(id as ProductType)}
              columns={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-prod-name">Nome do produto *</Label>
            <Input
              id="new-prod-name"
              placeholder="Ex: Curso de Marketing Digital"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-prod-desc">Descrição curta</Label>
            <Input
              id="new-prod-desc"
              placeholder="Breve descrição do produto"
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-prod-price">Preço *</Label>
            <Input
              id="new-prod-price"
              inputMode="numeric"
              placeholder="R$ 0,00"
              value={price}
              onChange={(e) => setPrice(maskCurrency(e.target.value))}
            />
          </div>

          <Button
            className="w-full"
            disabled={!isValid || createProduct.isPending}
            onClick={handleCreate}
          >
            {createProduct.isPending ? "Criando..." : "Criar produto"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default NewProductSheet;
