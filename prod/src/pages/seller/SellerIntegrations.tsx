import { useState, useEffect } from "react";
import PageContent from "@/components/layout/PageContent";
import { usePageMeta } from "@/contexts/PageMetaContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Webhook, Zap, MessageSquare, Key, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { fetchWebhookEndpoints, fetchWhatsAppInstances, fetchZapierIntegrations } from "@/services/integration.service";

const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  Webhook, Zap, MessageSquare, Key,
};

interface IntegrationItem {
  name: string;
  description: string;
  iconName: string;
  connected: boolean;
  category: string;
  comingSoon?: boolean;
}

const SellerIntegrations = () => {
  usePageMeta([{ label: "Vendedor", path: "/app" }, { label: "Integrações" }], "Integrações");
  const navigate = useNavigate();
  const [integrations, setIntegrations] = useState<IntegrationItem[]>([
    { name: "Webhook", description: "Receba notificações em tempo real via HTTP POST", iconName: "Webhook", connected: false, category: "Automação" },
    { name: "Zapier", description: "Conecte com 5.000+ apps via Zapier", iconName: "Zap", connected: false, category: "Automação" },
    { name: "WhatsApp", description: "Conecte seu WhatsApp e envie mensagens automáticas", iconName: "MessageSquare", connected: false, category: "Comunicação", comingSoon: true },
    { name: "API", description: "Integre diretamente com nossa API REST", iconName: "Key", connected: false, category: "Desenvolvimento", comingSoon: true },
  ]);

  useEffect(() => {
    const load = async () => {
      try {
        const [webhooks, whatsapp, zapier] = await Promise.all([
          fetchWebhookEndpoints().catch(() => []),
          fetchWhatsAppInstances().catch(() => []),
          fetchZapierIntegrations().catch(() => []),
        ]);
        setIntegrations((prev) => prev.map((item) => {
          if (item.name === "Webhook") return { ...item, connected: webhooks.length > 0 };
          if (item.name === "WhatsApp") return { ...item, connected: whatsapp.length > 0 };
          if (item.name === "Zapier") return { ...item, connected: zapier.length > 0 };
          return item;
        }));
      } catch {
        void 0;
      }
    };
    load();
  }, []);

  const handleAction = (name: string) => {
    if (name === "Webhook") navigate("/app/integrations/webhooks");
    if (name === "WhatsApp") navigate("/app/integrations/whatsapp");
    if (name === "Zapier") navigate("/app/integrations/zapier");
  };

  return (
    <PageContent>
    <p className="text-sm text-muted-foreground mb-6">Conecte ferramentas externas para automatizar seu fluxo de vendas.</p>
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {integrations.map((item) => {
        const Icon = iconMap[item.iconName];
        return (
          <Card key={item.name} className={item.comingSoon ? "opacity-60" : ""}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                    {Icon && <Icon className="h-6 w-6" />}
                  </div>
                  <div>
                    <CardTitle className="text-sm">{item.name}</CardTitle>
                    <Badge variant="secondary" className="text-[10px] mt-1">{item.category}</Badge>
                  </div>
                </div>
                {item.comingSoon ? (
                  <Badge variant="outline" className="text-[10px] gap-1"><Clock className="h-3 w-3" />Em breve</Badge>
                ) : item.connected ? (
                  <Badge className="bg-success/15 text-success border-0 text-[10px]">Conectado</Badge>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <CardDescription className="text-xs mb-4">{item.description}</CardDescription>
              {item.comingSoon ? (
                <Button variant="outline" size="sm" className="w-full" disabled>Em breve</Button>
              ) : (
                <Button
                  variant={item.connected ? "outline" : "default"}
                  size="sm"
                  className="w-full"
                  onClick={() => handleAction(item.name)}
                >
                  {item.connected ? "Configurar" : "Conectar"}
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
    </PageContent>
  );
};

export default SellerIntegrations;
