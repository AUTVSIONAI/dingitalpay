import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import LoadingState from "@/components/shared/LoadingState";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { fetchPublicOfferBySlug } from "@/services/product.service";

const CheckoutBySlug = () => {
  const { slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;

    const resolve = async () => {
      const data = await fetchPublicOfferBySlug(slug);
      if (!data) {
        setNotFound(true);
        return;
      }

      if (!data.active) {
        setNotFound(true);
        return;
      }

      // Redirect to the canonical public checkout route.
      navigate(`/checkout/offer/${data.id}${location.search || ""}`, { replace: true });
    };

    resolve();
  }, [slug, navigate, location.search]);

  if (notFound) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-4">
        <p className="text-muted-foreground">Link de pagamento não encontrado ou inativo.</p>
        <Button variant="outline" onClick={() => navigate("/")}>
          <ArrowLeft className="h-4 w-4 mr-2" />Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <LoadingState />
    </div>
  );
};

export default CheckoutBySlug;
