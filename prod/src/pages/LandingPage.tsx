import { Link } from "react-router-dom";
import { useTheme } from "next-themes";
import { ArrowRight, BarChart3, Check, Moon, ShieldCheck, Sun, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import TermsAndPrivacy from "@/components/shared/TermsAndPrivacy";
import { usePlatformLogo, usePlatformSettings } from "@/hooks/usePlatformSettings";
import logoCielo from "@/assets/logo-cielo.png";
import logoGetnet from "@/assets/logo-getnet.png";
import logoKiPay from "@/assets/logo-kipay.png";
import logoMercadoPago from "@/assets/logo-mp.png";
import logoRede from "@/assets/logo-rede.png";
import logoStone from "@/assets/logo-stone.png";

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

  const integrations = [
    { name: "Mercado Pago", logo: logoMercadoPago },
    { name: "Cielo", logo: logoCielo },
    { name: "Getnet", logo: logoGetnet },
    { name: "Rede", logo: logoRede },
    { name: "Stone", logo: logoStone },
    { name: "KiPay", logo: logoKiPay },
  ];

  const testimonials = [
    {
      name: "Marina S.",
      role: "Infoprodutora",
      content: "Consegui publicar ofertas e organizar a entrega do conteúdo sem depender de mil ferramentas.",
    },
    {
      name: "Lucas R.",
      role: "Gestor de tráfego",
      content: "O checkout é rápido e o funil fica bem mais claro com relatórios e eventos para automação.",
    },
    {
      name: "Equipe Operação",
      role: "SaaS / Conteúdo",
      content: "Ter tudo no mesmo lugar reduz retrabalho: vendas, acesso, membros e gestão da plataforma.",
    },
  ];

  const faq = [
    {
      id: "item-1",
      title: "Preciso de servidor próprio (VPS)?",
      content:
        "Você pode rodar em VPS própria com Docker. Isso dá controle total e facilita integrações e domínio personalizado.",
    },
    {
      id: "item-2",
      title: "O que eu consigo vender?",
      content:
        "Produtos digitais, ofertas com link/slug e conteúdos na área de membros. O fluxo cobre checkout, pagamento e entrega.",
    },
    {
      id: "item-3",
      title: "Tem área do comprador?",
      content:
        "Sim. Compradores podem entrar, ver compras e acessar conteúdos liberados pela plataforma.",
    },
    {
      id: "item-4",
      title: "Dá para integrar com automações?",
      content:
        "Sim. Você pode usar webhooks e integrações para disparar eventos em ferramentas externas.",
    },
    {
      id: "item-5",
      title: "Como personalizo a identidade visual?",
      content:
        "No painel admin você configura nome, links, logo, favicon e paleta. A landing e o app usam essas configurações.",
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
              Plataforma
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
                <Badge>Venda produtos digitais</Badge>
                <Badge variant="secondary">Checkout otimizado</Badge>
                <Badge variant="secondary">Área de membros</Badge>
              </div>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                O jeito mais simples de gerenciar vendas e entrega do seu produto digital.
              </h1>
              <p className="text-lg text-muted-foreground">{description}</p>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <Button asChild size="lg">
                  <Link to="/auth/register">Começar agora</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/auth/login">Acessar painel</Link>
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
                    <div className="text-2xl font-semibold">+ conversão</div>
                    <div className="text-sm text-muted-foreground">Fluxo de checkout focado em resultado</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold">Tudo em um</div>
                    <div className="text-sm text-muted-foreground">Produtos, vendas, alunos e automações</div>
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
              <div className="text-2xl font-semibold">Como funciona</div>
              <div className="text-sm text-muted-foreground">Do zero à primeira venda em etapas simples.</div>
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <Card className="border-primary/10">
                <CardHeader>
                  <CardTitle className="text-base">1) Crie sua conta</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Acesse o painel e finalize as configurações iniciais da plataforma.
                </CardContent>
              </Card>
              <Card className="border-primary/10">
                <CardHeader>
                  <CardTitle className="text-base">2) Publique seu produto</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Crie produtos e ofertas com link para checkout, com regras e conteúdos.
                </CardContent>
              </Card>
              <Card className="border-primary/10">
                <CardHeader>
                  <CardTitle className="text-base">3) Venda e entregue</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Receba pagamentos, acompanhe vendas e libere acesso na área de membros.
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="mt-16">
            <div className="flex flex-col gap-2">
              <div className="text-2xl font-semibold">Planos</div>
              <div className="text-sm text-muted-foreground">
                Comece pequeno e evolua conforme sua operação cresce.
              </div>
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <Card className="border-primary/10">
                <CardHeader>
                  <CardTitle className="text-base">Starter</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="text-muted-foreground">Para validar seu produto e rodar o essencial.</div>
                  <div className="grid gap-2">
                    {["Checkout e links", "Área do comprador", "Relatórios básicos"].map((item) => (
                      <div key={item} className="flex items-start gap-2">
                        <Check className="mt-0.5 h-4 w-4 text-primary" />
                        <div className="text-muted-foreground">{item}</div>
                      </div>
                    ))}
                  </div>
                  <Button asChild className="w-full">
                    <Link to="/auth/register">Começar</Link>
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-primary/10">
                <CardHeader>
                  <CardTitle className="text-base">Pro</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="text-muted-foreground">Para escalar com integrações e automações.</div>
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
              <div className="text-2xl font-semibold">Integrações</div>
              <div className="text-sm text-muted-foreground">Conecte pagamentos e automações para escalar sua operação.</div>
            </div>
            <div className="mt-6 rounded-2xl border border-primary/10 bg-background/40 p-6">
              <div className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
                {integrations.map((integration) => (
                  <img
                    key={integration.name}
                    src={integration.logo}
                    alt={integration.name}
                    className="h-8 w-auto opacity-70 grayscale transition hover:opacity-100 hover:grayscale-0"
                    loading="lazy"
                  />
                ))}
              </div>
            </div>
          </section>

          <section className="mt-16">
            <div className="flex flex-col gap-2">
              <div className="text-2xl font-semibold">Prévia do produto</div>
              <div className="text-sm text-muted-foreground">Um gostinho do painel para você entender o fluxo.</div>
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <Card className="border-primary/10">
                <CardHeader>
                  <CardTitle className="text-base">Dashboard</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between rounded-lg border border-primary/10 bg-background/40 px-3 py-2">
                    <div className="text-sm font-semibold">Vendas</div>
                    <div className="text-xs text-muted-foreground">Hoje</div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-lg bg-primary/10 p-3">
                      <div className="text-xs text-muted-foreground">Total</div>
                      <div className="mt-1 text-base font-semibold">R$ 12.480</div>
                    </div>
                    <div className="rounded-lg bg-primary/10 p-3">
                      <div className="text-xs text-muted-foreground">Pedidos</div>
                      <div className="mt-1 text-base font-semibold">84</div>
                    </div>
                    <div className="rounded-lg bg-primary/10 p-3">
                      <div className="text-xs text-muted-foreground">Conversão</div>
                      <div className="mt-1 text-base font-semibold">3,9%</div>
                    </div>
                  </div>
                  <div className="rounded-lg bg-primary/10 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">Últimos 7 dias</div>
                      <div className="text-xs text-muted-foreground">+18%</div>
                    </div>
                    <div className="flex h-16 items-end gap-1">
                      {[22, 34, 28, 40, 48, 44, 56].map((h) => (
                        <div key={h} className="flex-1 rounded-sm bg-primary/25" style={{ height: `${h}%` }} />
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-primary/10">
                <CardHeader>
                  <CardTitle className="text-base">Checkout</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-lg border border-primary/10 bg-background/40 px-3 py-2">
                    <div className="text-sm font-semibold">Oferta: Curso Digital</div>
                    <div className="text-xs text-muted-foreground">Pagamento em segundos</div>
                  </div>
                  <div className="rounded-lg bg-primary/10 p-3">
                    <div className="flex items-center justify-between text-sm">
                      <div className="text-muted-foreground">Subtotal</div>
                      <div className="font-semibold">R$ 297,00</div>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm">
                      <div className="text-muted-foreground">Taxas</div>
                      <div className="font-semibold">R$ 0,00</div>
                    </div>
                    <div className="mt-3 h-px bg-primary/10" />
                    <div className="mt-3 flex items-center justify-between text-sm">
                      <div className="text-muted-foreground">Total</div>
                      <div className="text-base font-semibold">R$ 297,00</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-primary/10 px-3 py-2 text-xs text-muted-foreground">Pix</div>
                    <div className="rounded-lg bg-primary/10 px-3 py-2 text-xs text-muted-foreground">Cartão</div>
                  </div>
                  <div className="rounded-lg bg-primary/15 px-3 py-2 text-center text-sm font-semibold text-primary">
                    Finalizar compra
                  </div>
                </CardContent>
              </Card>
              <Card className="border-primary/10">
                <CardHeader>
                  <CardTitle className="text-base">Área de membros</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-lg border border-primary/10 bg-background/40 px-3 py-2">
                    <div className="text-sm font-semibold">Meus cursos</div>
                    <div className="text-xs text-muted-foreground">Acesso imediato após pagamento</div>
                  </div>
                  <div className="grid gap-2">
                    {[
                      { title: "Boas-vindas", progress: 100 },
                      { title: "Módulo 1", progress: 65 },
                      { title: "Módulo 2", progress: 20 },
                    ].map((item) => (
                      <div key={item.title} className="rounded-lg bg-primary/10 p-3">
                        <div className="flex items-center justify-between">
                          <div className="text-sm font-semibold">{item.title}</div>
                          <div className="text-xs text-muted-foreground">{item.progress}%</div>
                        </div>
                        <div className="mt-2 h-1.5 w-full rounded-full bg-primary/10">
                          <div
                            className="h-1.5 rounded-full bg-primary/40"
                            style={{ width: `${item.progress}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="mt-16">
            <div className="flex flex-col gap-2">
              <div className="text-2xl font-semibold">Depoimentos</div>
              <div className="text-sm text-muted-foreground">O que times usam para ganhar velocidade e controle.</div>
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              {testimonials.map((t) => (
                <Card key={t.name} className="border-primary/10">
                  <CardContent className="space-y-4 p-6">
                    <div className="text-sm text-muted-foreground">{t.content}</div>
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                        {t.name
                          .split(" ")
                          .slice(0, 2)
                          .map((part) => part[0])
                          .join("")
                          .toUpperCase()}
                      </div>
                      <div className="leading-tight">
                        <div className="text-sm font-semibold">{t.name}</div>
                        <div className="text-xs text-muted-foreground">{t.role}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="mt-16">
            <div className="flex flex-col gap-2">
              <div className="text-2xl font-semibold">FAQ</div>
              <div className="text-sm text-muted-foreground">Respostas rápidas para começar sem travar.</div>
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
                <div className="text-xl font-semibold">Pronto para começar?</div>
                <div className="text-sm text-muted-foreground">
                  Crie sua conta e configure sua plataforma em poucos minutos.
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
