import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { BreadcrumbItem } from "@/types";
import { getPlatformSettings } from "@/services/admin.service";

interface PageMetaState {
  breadcrumbs: BreadcrumbItem[];
  pageTitle: string;
}

interface PageMetaContextType extends PageMetaState {
  setMeta: (breadcrumbs: BreadcrumbItem[], pageTitle: string) => void;
}

const PageMetaContext = createContext<PageMetaContextType>({
  breadcrumbs: [],
  pageTitle: "",
  setMeta: () => {},
});

export const PageMetaProvider = ({ children }: { children: ReactNode }) => {
  const [meta, setMetaState] = useState<PageMetaState>({ breadcrumbs: [], pageTitle: "" });
  const { data: platformSettings } = useQuery({
    queryKey: ["platform-settings"],
    queryFn: getPlatformSettings,
    staleTime: 5 * 60 * 1000,
  });

  const setMeta = (breadcrumbs: BreadcrumbItem[], pageTitle: string) => {
    setMetaState({ breadcrumbs, pageTitle });
  };

  useEffect(() => {
    const platformName = String(platformSettings?.platformName || "").trim() || "Plataforma";
    document.title = meta.pageTitle ? `${meta.pageTitle} | ${platformName}` : platformName;
  }, [meta.pageTitle, platformSettings?.platformName]);

  return (
    <PageMetaContext.Provider value={{ ...meta, setMeta }}>
      {children}
    </PageMetaContext.Provider>
  );
};

export function usePageMeta(breadcrumbs: BreadcrumbItem[], pageTitle: string) {
  const { setMeta } = useContext(PageMetaContext);
  const key = JSON.stringify({ breadcrumbs, pageTitle });
  useEffect(() => {
    setMeta(breadcrumbs, pageTitle);
  }, [key]);
}

export function usePageMetaValues() {
  const { breadcrumbs, pageTitle } = useContext(PageMetaContext);
  return { breadcrumbs, pageTitle };
}
