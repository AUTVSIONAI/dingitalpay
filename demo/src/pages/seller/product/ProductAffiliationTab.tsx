import { Clock } from "lucide-react";

const ProductAffiliationTab = () => {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center">
        <Clock className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">Em breve</h3>
      <p className="text-sm text-muted-foreground text-center max-w-md">
        O programa de afiliados estará disponível em breve. Estamos trabalhando para trazer essa funcionalidade para você.
      </p>
    </div>
  );
};

export default ProductAffiliationTab;
