import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { usePublicProducts, useCreateAffiliateLink } from "@/hooks/useProducts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import LoadingState from "@/components/shared/LoadingState";
import EmptyState from "@/components/shared/EmptyState";
import CopyToClipboardField from "@/components/shared/CopyToClipboardField";
import { ShoppingBag, Search, ExternalLink, Link2 } from "lucide-react";
import { toast } from "sonner";

const typeLabel: Record<string, string> = {
  ebook: "E-book",
  course: "Curso",
  physical: "Produto físico",
};

const Marketplace = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, role } = useAuth();

  const appArea = useMemo(() => {
    const path = location.pathname || "/";
    return path.startsWith("/app/") || path.startsWith("/buyer/") || path.startsWith("/admin/");
  }, [location.pathname]);

  const backPath = useMemo(() => {
    const path = location.pathname || "/";
    if (path.startsWith("/buyer/")) return "/buyer/purchases";
    if (path.startsWith("/admin/")) return "/admin/dashboard";
    if (path.startsWith("/app/")) return "/app/dashboard";
    return "/";
  }, [location.pathname]);

  const accountPath = useMemo(() => {
    if (role === "buyer") return "/buyer/purchases";
    if (role === "seller") return "/app/dashboard";
    if (role === "admin") return "/admin/dashboard";
    return "/";
  }, [role]);

  const [q, setQ] = useState("");
  const [submittedQ, setSubmittedQ] = useState("");
  const { data: products = [], isLoading } = usePublicProducts({ q: submittedQ, limit: 24, offset: 0 });

  const createLink = useCreateAffiliateLink();
  const [affiliateUrlsByProductId, setAffiliateUrlsByProductId] = useState<Record<string, string>>({});

  const filtered = useMemo(() => products, [products]);

  const handleGenerateAffiliateLink = async (productId: string) => {
    if (!user) {
      navigate("/buyer/login");
      return;
    }
    try {
      const res = await createLink.mutateAsync({ product_id: productId, offer_id: null });
      setAffiliateUrlsByProductId((prev) => ({ ...prev, [productId]: res.url }));
      try {
        await navigator.clipboard.writeText(res.url);
        toast.success("Link copiado!");
      } catch {
        toast.success("Link gerado!");
      }
    } catch {
      void 0;
    }
  };

  const handleOpenCheckout = (productId: string) => {
    const returnTo = `/checkout/${productId}`;
    if (!user) {
      navigate(`/buyer/register?returnTo=${encodeURIComponent(returnTo)}`);
      return;
    }
    navigate(returnTo);
  };

  return (
    <div className={appArea ? "bg-background text-foreground" : "min-h-screen bg-background text-foreground"}>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          {appArea ? (
            <Button asChild variant="ghost" className="-ml-2">
              <Link to={backPath}>Voltar</Link>
            </Button>
          ) : null}
          <Link to={appArea ? backPath : "/"} className="flex items-center gap-2">
          <ShoppingBag className="h-5 w-5 text-primary" />
          <span className="text-sm font-semibold">Marketplace</span>
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {user ? (
            <Button asChild variant="outline">
              <Link to={accountPath}>Minha conta</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" className="hidden sm:inline-flex">
                <Link to="/auth/login">Entrar</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/buyer/login">Sou comprador</Link>
              </Button>
            </>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 pb-16">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight">Produtos da plataforma</h1>
          <p className="text-sm text-muted-foreground">Explore produtos ativos e gere seu link de afiliado.</p>
        </div>

        <form
          className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmittedQ(q.trim());
          }}
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar por nome..." value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Button type="submit" className="sm:w-auto">Buscar</Button>
        </form>

        {isLoading ? (
          <div className="py-12">
            <LoadingState />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12">
            <EmptyState
              icon={<ShoppingBag className="h-12 w-12" />}
              title="Nenhum produto encontrado"
              description="Tente buscar por outro nome."
            />
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => {
              const image = String(p.image_url || "").trim() || "/placeholder.svg";
              const affiliateUrl = affiliateUrlsByProductId[p.id];

              return (
                <Card key={p.id} className="overflow-hidden">
                  <div className="aspect-[16/9] bg-muted">
                    <img src={image} alt={p.name} className="h-full w-full object-cover" />
                  </div>
                  <CardHeader className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-tight">{p.name}</CardTitle>
                      <Badge variant="secondary" className="shrink-0">{typeLabel[p.type] || "Produto"}</Badge>
                    </div>
                    <div className="text-sm text-muted-foreground line-clamp-2">{p.short_description || "—"}</div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-sm font-semibold">
                      R$ {Number(p.price).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>

                    {affiliateUrl ? (
                      <CopyToClipboardField value={affiliateUrl} />
                    ) : (
                      <div className="flex flex-col gap-2">
                        <Button
                          variant="outline"
                          className="w-full"
                          onClick={() => handleGenerateAffiliateLink(p.id)}
                          disabled={createLink.isPending}
                        >
                          <Link2 className="h-4 w-4 mr-2" />
                          Gerar link de afiliado
                        </Button>
                      </div>
                    )}

                    <Button
                      className="w-full"
                      onClick={() => handleOpenCheckout(p.id)}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Ver checkout
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};

export default Marketplace;
