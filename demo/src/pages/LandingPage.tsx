import { Link } from "react-router-dom";
import { useTheme } from "next-themes";
import { ArrowRight, BarChart3, Check, Moon, ShieldCheck, Sun, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import TermsAndPrivacy from "@/components/shared/TermsAndPrivacy";
import { usePlatformLogo, usePlatformSettings } from "@/hooks/usePlatformSettings";

const LandingPage = () => {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const { data: settings } = usePlatformSettings();
  const { logoUrl } = usePlatformLogo();

  const platformName = settings?.platformName || "DingitalPay";
  const description =
    settings?.description ||
    "Checkout rápido, área de membros e automações para escalar sua operação com confiança.";
  const supportEmail = String(settings?.supportEmail || "").trim();

  const features = [
    {
      title: "Checkout e pagamentos",
      description: "Pix, cartão e fluxo otimizado para conversão.",
      icon: <Zap className="h-5 w-5" />,
    },
    {
      title: "Segurança e conformidade",
      description: "Sessões seguras, políticas e proteção contra abuso.",
      icon: <ShieldCheck className="h-5 w-5" />,
    },
    {
      title: "Relatórios e gestão",
      description: "Acompanhe vendas, métricas e performance do funil.",
      icon: <BarChart3 className="h-5 w-5" />,
    },
  ];

  const highlights = [
    "Produtos, ofertas e links em minutos",
    "Área do comprador e acesso a conteúdo",
    "Webhooks e integrações para automações",
    "Painel admin para configurações da plataforma",
  ];

  const faq = [
    {
      id: "item-1",
      title: "O que é o modo demonstração?",
      content:
        "É um ambiente para você explorar a plataforma com dados controlados e sem risco para sua operação.",
    },
    {
      id: "item-2",
      title: "Por que algumas ações podem ficar bloqueadas?",
      content:
        "O modo demo pode bloquear ações de escrita para evitar alterações permanentes e manter o ambiente estável.",
    },
    {
      id: "item-3",
      title: "Consigo testar checkout e fluxo de compra?",
      content:
        "Sim. Você consegue navegar pelo fluxo e entender a experiência do comprador e do vendedor.",
    },
    {
      id: "item-4",
      title: "Como vou para a versão completa?",
      content:
        "Crie uma conta e acesse o ambiente de produção para configurar sua plataforma e operar normalmente.",
    },
    {
      id: "item-5",
      title: "Posso personalizar a identidade visual?",
      content:
        "No painel admin você configura nome, links, logo, favicon e paleta. Em produção isso reflete no app.",
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/10 via-background to-background" />
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
          <Link to="/" className="flex items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt={platformName} className="h-8 w-auto object-contain" />
            ) : (
              <div className="text-lg font-semibold">{platformName}</div>
            )}
            <Badge variant="secondary" className="hidden sm:inline-flex">
              Demonstração
            </Badge>
          </Link>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(isDark ? "light" : "dark")}
              aria-label="Alternar tema"
            >
              {isDark ? <Sun className="h-5 w-5 text-muted-foreground" /> : <Moon className="h-5 w-5 text-muted-foreground" />}
            </Button>
            <Button asChild variant="ghost" className="hidden sm:inline-flex">
              <Link to="/admin/login">Admin</Link>
            </Button>
            <Button asChild variant="outline" className="hidden sm:inline-flex">
              <Link to="/auth/login">Entrar</Link>
            </Button>
            <Button asChild>
              <Link to="/auth/register">
                Criar conta <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-6 pb-16 pt-6">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div className="space-y-6">
              <div className="flex flex-wrap items-center gap-2">
                <Badge>Teste a plataforma</Badge>
                <Badge variant="secondary">Fluxo real</Badge>
                <Badge variant="secondary">Dados demo</Badge>
              </div>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                Conheça o {platformName} em modo demonstração.
              </h1>
              <p className="text-lg text-muted-foreground">{description}</p>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button asChild size="lg">
                  <Link to="/auth/register">Criar conta</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/auth/login">Entrar</Link>
                </Button>
                <Button asChild size="lg" variant="ghost">
                  <Link to="/buyer/login">Sou comprador</Link>
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {highlights.map((item) => (
                  <div key={item} className="flex items-start gap-2 text-sm">
                    <div className="mt-0.5 rounded-full bg-primary/15 p-1 text-primary">
                      <Check className="h-3.5 w-3.5" />
                    </div>
                    <div className="text-muted-foreground">{item}</div>
                  </div>
                ))}
              </div>

              <div className="pt-2">
                <TermsAndPrivacy mode="login" />
              </div>
            </div>

            <div className="grid gap-4">
              {features.map((f) => (
                <Card key={f.title} className="border-primary/10">
                  <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                    <div className="rounded-lg bg-primary/10 p-2 text-primary">{f.icon}</div>
                    <CardTitle className="text-base">{f.title}</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">{f.description}</CardContent>
                </Card>
              ))}

              <Card className="border-primary/10">
                <CardContent className="grid gap-4 p-6 sm:grid-cols-3">
                  <div>
                    <div className="text-2xl font-semibold">Fluxo completo</div>
                    <div className="text-sm text-muted-foreground">Experiência real do checkout</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold">Dados controlados</div>
                    <div className="text-sm text-muted-foreground">Sem risco para sua operação</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold">Pronto p/ VPS</div>
                    <div className="text-sm text-muted-foreground">Stack em Docker para subir rápido</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          <section className="mt-16">
            <div className="flex flex-col gap-2">
              <div className="text-2xl font-semibold">O que você consegue testar</div>
              <div className="text-sm text-muted-foreground">Uma visão completa do fluxo, com dados controlados.</div>
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <Card className="border-primary/10">
                <CardHeader>
                  <CardTitle className="text-base">Checkout</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Veja o fluxo do comprador do link da oferta até a confirmação.
                </CardContent>
              </Card>
              <Card className="border-primary/10">
                <CardHeader>
                  <CardTitle className="text-base">Painel do vendedor</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Navegue por produtos, vendas e configurações para entender a experiência.
                </CardContent>
              </Card>
              <Card className="border-primary/10">
                <CardHeader>
                  <CardTitle className="text-base">Área de membros</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Explore cursos e lições para ver como a entrega do conteúdo funciona.
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="mt-16">
            <div className="flex flex-col gap-2">
              <div className="text-2xl font-semibold">Versão completa</div>
              <div className="text-sm text-muted-foreground">
                Quando estiver pronto para operar, use o ambiente de produção.
              </div>
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <Card className="border-primary/10">
                <CardHeader>
                  <CardTitle className="text-base">Starter</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="text-muted-foreground">Comece com o essencial para publicar e vender.</div>
                  <div className="grid gap-2">
                    {["Checkout e links", "Área do comprador", "Relatórios básicos"].map((item) => (
                      <div key={item} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 text-primary" />
                        <div className="text-muted-foreground">{item}</div>
                      </div>
                    ))}
                  </div>
                  <Button asChild className="w-full">
                    <Link to="/auth/register">Criar conta</Link>
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-primary/10">
                <CardHeader>
                  <CardTitle className="text-base">Pro</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="text-muted-foreground">Escale com integrações e automações.</div>
                  <div className="grid gap-2">
                    {["Webhooks e integrações", "Gestão de produtos e ofertas", "Recursos de membros"].map((item) => (
                      <div key={item} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 text-primary" />
                        <div className="text-muted-foreground">{item}</div>
                      </div>
                    ))}
                  </div>
                  <Button asChild variant="outline" className="w-full">
                    <Link to="/auth/register">Quero escalar</Link>
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-primary/10">
                <CardHeader>
                  <CardTitle className="text-base">Enterprise</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="text-muted-foreground">Para operação completa com configurações avançadas.</div>
                  <div className="grid gap-2">
                    {["Configurações avançadas", "Ajustes de marca e domínios", "Rotinas de operação"].map((item) => (
                      <div key={item} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 text-primary" />
                        <div className="text-muted-foreground">{item}</div>
                      </div>
                    ))}
                  </div>
                  {supportEmail ? (
                    <Button asChild variant="secondary" className="w-full">
                      <a href={`mailto:${supportEmail}`}>Falar com o time</a>
                    </Button>
                  ) : (
                    <Button asChild variant="secondary" className="w-full">
                      <Link to="/auth/register">Falar com o time</Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="mt-16">
            <div className="flex flex-col gap-2">
              <div className="text-2xl font-semibold">FAQ</div>
              <div className="text-sm text-muted-foreground">Dúvidas comuns sobre o modo demonstração.</div>
            </div>
            <div className="mt-6 rounded-2xl border border-primary/10 bg-background/40 p-4 sm:p-6">
              <Accordion type="single" collapsible defaultValue="item-1">
                {faq.map((item) => (
                  <AccordionItem key={item.id} value={item.id}>
                    <AccordionTrigger>{item.title}</AccordionTrigger>
                    <AccordionContent className="text-muted-foreground">{item.content}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </section>

          <div className="mt-14 rounded-2xl border border-primary/10 bg-primary/5 p-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="space-y-1">
                <div className="text-xl font-semibold">Quer a versão completa?</div>
                <div className="text-sm text-muted-foreground">
                  Crie uma conta e continue com a sua operação em produção.
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link to="/auth/register">Criar conta</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/auth/login">Já tenho conta</Link>
                </Button>
              </div>
            </div>
          </div>

          <footer className="mt-12 flex flex-col gap-2 text-center text-xs text-muted-foreground">
            <div>{platformName}</div>
            <TermsAndPrivacy mode="login" />
          </footer>
        </main>
      </div>
    </div>
  );
};

export default LandingPage;
