import { useMaintenanceMode } from "@/hooks/usePlatformSettings";

export const useMaintenanceGuard = () => {
  const { isMaintenanceMode, isLoading } = useMaintenanceMode();

  return {
    isMaintenanceMode,
    isLoading,
  };
};
