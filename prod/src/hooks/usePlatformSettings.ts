import { useQuery } from "@tanstack/react-query";
import { getPlatformSettings } from "@/services/admin.service";
import { optimizeImageUrl } from "@/lib/image-utils";

/**
 * Single source of truth for platform settings.
 * Uses the same query key ["platform-settings"] everywhere
 * so React Query deduplicates all calls into one request.
 */
export const usePlatformSettings = () => {
  return useQuery({
    queryKey: ["platform-settings"],
    queryFn: getPlatformSettings,
    staleTime: 5 * 60 * 1000, // 5 min
    gcTime: 10 * 60 * 1000,
  });
};

export const usePlatformLogo = () => {
  const { data, isLoading } = usePlatformSettings();
  const rawUrl = data?.darkLogoUrl || data?.whiteLogoUrl || data?.logoUrl || null;
  // Optimize: resize to max 426px wide for typical display at ~213px (2x retina)
  const logoUrl = optimizeImageUrl(rawUrl, { width: 426, quality: 80 });
  return { logoUrl, isLoading };
};

export const useMaintenanceMode = () => {
  const { data, isLoading } = usePlatformSettings();
  return {
    isMaintenanceMode: data?.maintenanceMode ?? false,
    isLoading,
  };
};

export const usePlatformUrl = () => {
  const { data, isLoading } = usePlatformSettings();
  return {
    platformUrl: isLoading ? undefined : (data?.platformUrl || ""),
    isLoading,
  };
};
