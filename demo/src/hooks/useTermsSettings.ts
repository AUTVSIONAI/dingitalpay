import { useQuery } from "@tanstack/react-query";
import { hasMeaningfulRichText } from "@/lib/rich-text";

export const useTermsSettings = () => {
  const { data } = useQuery({
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

  const hasTerms = hasMeaningfulRichText(data?.terms_of_use);
  const hasPrivacy = hasMeaningfulRichText(data?.privacy_policy);

  const requireAcceptance = Boolean(data?.require_terms_acceptance) && (hasTerms || hasPrivacy);

  return {
    requireAcceptance,
    hasTerms,
    hasPrivacy,
  };
};
