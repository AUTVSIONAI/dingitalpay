import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getPlatformSettings } from "@/services/admin.service";

export type PaletteKey = "blue" | "green" | "red" | "yellow" | "purple" | "orange";

interface PaletteColors {
  label: string;
  swatch: string;
  /** Gradient stops for neon mode */
  gradientFrom: string;
  gradientTo: string;
  neonColor: string;
  light: Record<string, string>;
  dark: Record<string, string>;
}

const palettes: Record<PaletteKey, PaletteColors> = {
  blue: {
    label: "Azul",
    swatch: "#2563eb",
    gradientFrom: "hsl(224, 76%, 48%)",
    gradientTo: "hsl(200, 90%, 55%)",
    neonColor: "224 76% 48%",
    light: {
      "--primary": "224 76% 48%",
      "--primary-foreground": "0 0% 100%",
      "--ring": "224 76% 48%",
      "--sidebar-accent": "224 76% 48%",
      "--sidebar-primary": "224 76% 48%",
      "--sidebar-ring": "224 76% 48%",
      "--chart-1": "224 76% 48%",
    },
    dark: {
      "--background": "222 15% 3%",
      "--card": "222 12% 5%",
      "--popover": "222 12% 5%",
      "--primary": "224 76% 55%",
      "--primary-foreground": "0 0% 100%",
      "--ring": "224 76% 55%",
      "--border": "222 12% 12%",
      "--input": "222 12% 12%",
      "--secondary": "222 12% 8%",
      "--muted": "222 12% 8%",
      "--accent": "222 12% 8%",
      "--sidebar-bg": "222 15% 3%",
      "--sidebar-accent": "224 76% 55%",
      "--sidebar-primary": "224 76% 55%",
      "--sidebar-ring": "224 76% 55%",
      "--sidebar-background": "222 15% 3%",
      "--sidebar-border": "222 12% 7%",
      "--sidebar-hover": "222 12% 5%",
      "--chart-1": "224 76% 55%",
    },
  },
  green: {
    label: "Verde",
    swatch: "#16a34a",
    gradientFrom: "hsl(142, 72%, 29%)",
    gradientTo: "hsl(160, 80%, 40%)",
    neonColor: "142 72% 35%",
    light: {
      "--primary": "142 72% 29%",
      "--primary-foreground": "0 0% 100%",
      "--ring": "142 72% 29%",
      "--sidebar-accent": "142 72% 29%",
      "--sidebar-primary": "142 72% 29%",
      "--sidebar-ring": "142 72% 29%",
      "--chart-1": "142 72% 29%",
    },
    dark: {
      "--background": "144 20% 3%",
      "--card": "144 15% 5%",
      "--popover": "144 15% 5%",
      "--primary": "142 72% 40%",
      "--primary-foreground": "0 0% 100%",
      "--ring": "142 72% 40%",
      "--border": "144 15% 12%",
      "--input": "144 15% 12%",
      "--secondary": "144 15% 8%",
      "--muted": "144 15% 8%",
      "--accent": "144 15% 8%",
      "--sidebar-bg": "144 20% 3%",
      "--sidebar-accent": "142 72% 40%",
      "--sidebar-primary": "142 72% 40%",
      "--sidebar-ring": "142 72% 40%",
      "--sidebar-background": "144 20% 3%",
      "--sidebar-border": "144 15% 7%",
      "--sidebar-hover": "144 15% 5%",
      "--chart-1": "142 72% 40%",
    },
  },
  red: {
    label: "Vermelho",
    swatch: "#dc2626",
    gradientFrom: "hsl(0, 72%, 51%)",
    gradientTo: "hsl(20, 85%, 55%)",
    neonColor: "0 72% 51%",
    light: {
      "--primary": "0 72% 51%",
      "--primary-foreground": "0 0% 100%",
      "--ring": "0 72% 51%",
      "--sidebar-accent": "0 72% 51%",
      "--sidebar-primary": "0 72% 51%",
      "--sidebar-ring": "0 72% 51%",
      "--chart-1": "0 72% 51%",
    },
    dark: {
      "--background": "0 15% 3%",
      "--card": "0 12% 5%",
      "--popover": "0 12% 5%",
      "--primary": "0 72% 55%",
      "--primary-foreground": "0 0% 100%",
      "--ring": "0 72% 55%",
      "--border": "0 12% 12%",
      "--input": "0 12% 12%",
      "--secondary": "0 12% 8%",
      "--muted": "0 12% 8%",
      "--accent": "0 12% 8%",
      "--sidebar-bg": "0 15% 3%",
      "--sidebar-accent": "0 72% 55%",
      "--sidebar-primary": "0 72% 55%",
      "--sidebar-ring": "0 72% 55%",
      "--sidebar-background": "0 15% 3%",
      "--sidebar-border": "0 12% 7%",
      "--sidebar-hover": "0 12% 5%",
      "--chart-1": "0 72% 55%",
    },
  },
  yellow: {
    label: "Amarelo",
    swatch: "#ca8a04",
    gradientFrom: "hsl(45, 93%, 40%)",
    gradientTo: "hsl(30, 95%, 50%)",
    neonColor: "45 93% 47%",
    light: {
      "--primary": "45 93% 40%",
      "--primary-foreground": "0 0% 100%",
      "--ring": "45 93% 40%",
      "--sidebar-accent": "45 93% 40%",
      "--sidebar-primary": "45 93% 40%",
      "--sidebar-ring": "45 93% 40%",
      "--chart-1": "45 93% 40%",
    },
    dark: {
      "--background": "40 15% 3%",
      "--card": "40 12% 5%",
      "--popover": "40 12% 5%",
      "--primary": "45 93% 47%",
      "--primary-foreground": "0 0% 5%",
      "--ring": "45 93% 47%",
      "--border": "40 12% 12%",
      "--input": "40 12% 12%",
      "--secondary": "40 12% 8%",
      "--muted": "40 12% 8%",
      "--accent": "40 12% 8%",
      "--sidebar-bg": "40 15% 3%",
      "--sidebar-accent": "45 93% 47%",
      "--sidebar-primary": "45 93% 47%",
      "--sidebar-ring": "45 93% 47%",
      "--sidebar-background": "40 15% 3%",
      "--sidebar-border": "40 12% 7%",
      "--sidebar-hover": "40 12% 5%",
      "--chart-1": "45 93% 47%",
    },
  },
  purple: {
    label: "Roxo",
    swatch: "#9333ea",
    gradientFrom: "hsl(271, 81%, 56%)",
    gradientTo: "hsl(290, 75%, 65%)",
    neonColor: "271 81% 56%",
    light: {
      "--primary": "271 81% 56%",
      "--primary-foreground": "0 0% 100%",
      "--ring": "271 81% 56%",
      "--sidebar-accent": "271 81% 56%",
      "--sidebar-primary": "271 81% 56%",
      "--sidebar-ring": "271 81% 56%",
      "--chart-1": "271 81% 56%",
    },
    dark: {
      "--background": "270 15% 3%",
      "--card": "270 12% 5%",
      "--popover": "270 12% 5%",
      "--primary": "271 81% 60%",
      "--primary-foreground": "0 0% 100%",
      "--ring": "271 81% 60%",
      "--border": "270 12% 12%",
      "--input": "270 12% 12%",
      "--secondary": "270 12% 8%",
      "--muted": "270 12% 8%",
      "--accent": "270 12% 8%",
      "--sidebar-bg": "270 15% 3%",
      "--sidebar-accent": "271 81% 60%",
      "--sidebar-primary": "271 81% 60%",
      "--sidebar-ring": "271 81% 60%",
      "--sidebar-background": "270 15% 3%",
      "--sidebar-border": "270 12% 7%",
      "--sidebar-hover": "270 12% 5%",
      "--chart-1": "271 81% 60%",
    },
  },
  orange: {
    label: "Laranja",
    swatch: "#ea580c",
    gradientFrom: "hsl(21, 90%, 48%)",
    gradientTo: "hsl(40, 95%, 55%)",
    neonColor: "21 90% 48%",
    light: {
      "--primary": "21 90% 48%",
      "--primary-foreground": "0 0% 100%",
      "--ring": "21 90% 48%",
      "--sidebar-accent": "21 90% 48%",
      "--sidebar-primary": "21 90% 48%",
      "--sidebar-ring": "21 90% 48%",
      "--chart-1": "21 90% 48%",
    },
    dark: {
      "--background": "20 15% 3%",
      "--card": "20 12% 5%",
      "--popover": "20 12% 5%",
      "--primary": "21 90% 55%",
      "--primary-foreground": "0 0% 100%",
      "--ring": "21 90% 55%",
      "--border": "20 12% 12%",
      "--input": "20 12% 12%",
      "--secondary": "20 12% 8%",
      "--muted": "20 12% 8%",
      "--accent": "20 12% 8%",
      "--sidebar-bg": "20 15% 3%",
      "--sidebar-accent": "21 90% 55%",
      "--sidebar-primary": "21 90% 55%",
      "--sidebar-ring": "21 90% 55%",
      "--sidebar-background": "20 15% 3%",
      "--sidebar-border": "20 12% 7%",
      "--sidebar-hover": "20 12% 5%",
      "--chart-1": "21 90% 55%",
    },
  },
};

interface ThemeColorContextType {
  palette: PaletteKey;
  setPalette: (key: PaletteKey) => void;
  neonMode: boolean;
  setNeonMode: (v: boolean) => void;
  glowMode: boolean;
  setGlowMode: (v: boolean) => void;
  palettes: Record<PaletteKey, PaletteColors>;
}

const ThemeColorContext = createContext<ThemeColorContextType>({
  palette: "blue",
  setPalette: () => {},
  neonMode: false,
  setNeonMode: () => {},
  glowMode: false,
  setGlowMode: () => {},
  palettes,
});

export const useThemeColor = () => useContext(ThemeColorContext);

const getStoredValue = <T,>(key: string, fallback: T): T => {
  try {
    const stored = localStorage.getItem(key);
    if (stored !== null) return JSON.parse(stored) as T;
  } catch {}
  return fallback;
};

export const ThemeColorProvider = ({ children }: { children: ReactNode }) => {
  const [palette, setPaletteState] = useState<PaletteKey>(() => {
    const stored = getStoredValue<string>("theme-palette", "blue");
    return (stored && palettes[stored as PaletteKey]) ? stored as PaletteKey : "blue";
  });
  const [neonMode, setNeonModeState] = useState(() => getStoredValue("theme-neon", false));
  const [glowMode, setGlowModeState] = useState(() => getStoredValue("theme-glow", false));

  // Fetch global settings from Supabase on mount and sync localStorage
  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const settings = await getPlatformSettings();
        if (settings) {
          const p = settings.palette as PaletteKey;
          if (p && palettes[p]) {
            setPaletteState(p);
            localStorage.setItem("theme-palette", JSON.stringify(p));
          }
          const neon = !!settings.neonMode;
          const glow = !!settings.glowMode;
          setNeonModeState(neon);
          setGlowModeState(glow);
          localStorage.setItem("theme-neon", JSON.stringify(neon));
          localStorage.setItem("theme-glow", JSON.stringify(glow));
        }
      } catch {
        // Use localStorage defaults
      }
    };
    fetchSettings();
  }, []);

  const setPalette = (key: PaletteKey) => {
    setPaletteState(key);
    localStorage.setItem("theme-palette", JSON.stringify(key));
  };

  const setNeonMode = (v: boolean) => {
    setNeonModeState(v);
    localStorage.setItem("theme-neon", JSON.stringify(v));
  };

  const setGlowMode = (v: boolean) => {
    setGlowModeState(v);
    localStorage.setItem("theme-glow", JSON.stringify(v));
  };

  // Apply neon mode CSS vars
  useEffect(() => {
    const root = document.documentElement;
    const p = palettes[palette];
    if (neonMode) {
      root.classList.add("neon-mode");
      root.style.setProperty("--neon-from", p.gradientFrom);
      root.style.setProperty("--neon-to", p.gradientTo);
      root.style.setProperty("--neon-glow", p.neonColor);
    } else {
      root.classList.remove("neon-mode");
      root.style.removeProperty("--neon-from");
      root.style.removeProperty("--neon-to");
      root.style.removeProperty("--neon-glow");
    }
  }, [neonMode, palette]);

  // Apply glow mode
  useEffect(() => {
    const root = document.documentElement;
    const p = palettes[palette];
    if (glowMode) {
      root.classList.add("glow-mode");
      root.style.setProperty("--glow-color", p.neonColor);
    } else {
      root.classList.remove("glow-mode");
      root.style.removeProperty("--glow-color");
    }
  }, [glowMode, palette]);

  useEffect(() => {
    const root = document.documentElement;
    const isDark = root.classList.contains("dark");
    const vars = isDark ? palettes[palette].dark : palettes[palette].light;

    Object.entries(vars).forEach(([prop, value]) => {
      root.style.setProperty(prop, value);
    });

    return () => {
      Object.keys({ ...palettes[palette].light, ...palettes[palette].dark }).forEach((prop) => {
        root.style.removeProperty(prop);
      });
    };
  }, [palette]);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains("dark");
      const vars = isDark ? palettes[palette].dark : palettes[palette].light;

      Object.keys({ ...palettes[palette].light, ...palettes[palette].dark }).forEach((prop) => {
        document.documentElement.style.removeProperty(prop);
      });

      Object.entries(vars).forEach(([prop, value]) => {
        document.documentElement.style.setProperty(prop, value);
      });
    });

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [palette]);

  return (
    <ThemeColorContext.Provider value={{ palette, setPalette, neonMode, setNeonMode, glowMode, setGlowMode, palettes }}>
      {children}
    </ThemeColorContext.Provider>
  );
};
