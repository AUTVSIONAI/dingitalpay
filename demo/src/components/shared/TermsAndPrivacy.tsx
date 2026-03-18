import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import DOMPurify from "dompurify";
import { hasMeaningfulRichText } from "@/lib/rich-text";

interface TermsAndPrivacyProps {
  /** "login" = links only; "register" = links + checkbox when required */
  mode: "login" | "register";
  /** Controlled checkbox state (register only) */
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const TermsAndPrivacy = ({ mode, checked, onCheckedChange }: TermsAndPrivacyProps) => {
  const [termsOpen, setTermsOpen] = useState(false);
  const [privacyOpen, setPrivacyOpen] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ["platform-settings-terms"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/public/legal", { credentials: "include" });
        const json = await res.json().catch(() => null);
        if (!res.ok || json?.error) return null;
        return json?.data ?? null;
      } catch {
        return null;
      }
    },
    staleTime: 1000 * 60 * 5,
  });

  const hasTerms = hasMeaningfulRichText(settings?.terms_of_use);
  const hasPrivacy = hasMeaningfulRichText(settings?.privacy_policy);
  const requireAcceptance = Boolean(settings?.require_terms_acceptance) && (hasTerms || hasPrivacy);

  // Nothing to show if no content configured
  if (!hasTerms && !hasPrivacy) return null;

  const TermsLink = () =>
    hasTerms ? (
      <Dialog open={termsOpen} onOpenChange={setTermsOpen}>
        <DialogTrigger asChild>
          <button type="button" className="text-primary hover:underline font-medium">
            Termos de Uso
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-lg max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Termos de Uso</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <div
              className="prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(settings!.terms_of_use),
              }}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>
    ) : null;

  const PrivacyLink = () =>
    hasPrivacy ? (
      <Dialog open={privacyOpen} onOpenChange={setPrivacyOpen}>
        <DialogTrigger asChild>
          <button type="button" className="text-primary hover:underline font-medium">
            Política de Privacidade
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-lg max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>Política de Privacidade</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <div
              className="prose prose-sm dark:prose-invert max-w-none"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(settings!.privacy_policy),
              }}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>
    ) : null;

  // Register mode with required acceptance → checkbox
  if (mode === "register" && requireAcceptance) {
    return (
      <div className="flex items-start gap-2">
        <Checkbox
          id="accept-terms"
          checked={checked}
          onCheckedChange={(v) => onCheckedChange?.(v === true)}
          className="mt-0.5"
        />
        <label htmlFor="accept-terms" className="text-sm text-muted-foreground leading-snug cursor-pointer">
          Li e aceito os <TermsLink />{hasPrivacy && hasTerms ? " e a " : ""}<PrivacyLink />
        </label>
      </div>
    );
  }

  // Login mode or register without required acceptance → just links
  return (
    <p className="text-center text-xs text-muted-foreground">
      Ao continuar, você concorda com os <TermsLink />{hasPrivacy && hasTerms ? " e a " : ""}<PrivacyLink />.
    </p>
  );
};

export default TermsAndPrivacy;
