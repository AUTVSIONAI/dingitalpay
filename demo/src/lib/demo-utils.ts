import { toast } from "@/hooks/use-toast";

/**
 * Returns true if running in demo mode.
 * Can be called outside React components (in services).
 */
const MOCK_DEMO_SESSION_KEY = "__demo_mode__";
const FORCE_MOCK_DEMO = String(import.meta.env.VITE_MOCK_DEMO || "").trim() === "1";

export const isDemo = () => {
  if (FORCE_MOCK_DEMO) return true;
  return sessionStorage.getItem(MOCK_DEMO_SESSION_KEY) === "1";
};

/**
 * Shows a toast blocking write actions in demo mode.
 * Returns true if blocked (demo mode), false if not.
 */
export const blockDemoWrite = (action?: string): boolean => {
  const shouldBlock = String(import.meta.env.VITE_DEMO_BLOCK_WRITES || "").trim() === "1";
  if (!shouldBlock) return false;
  if (!isDemo()) return false;
  toast({
    title: "🔒 Modo demonstração",
    description: action
      ? `"${action}" está disponível apenas na versão completa.`
      : "Esta ação está disponível apenas na versão completa.",
    variant: "default",
  });
  return true;
};
