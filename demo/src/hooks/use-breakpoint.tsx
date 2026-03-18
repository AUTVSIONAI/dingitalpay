import * as React from "react";

const MOBILE = 768;
const TABLET = 1024;

export function useBreakpoint() {
  const [width, setWidth] = React.useState(
    typeof window !== "undefined" ? window.innerWidth : 1200
  );

  React.useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  return {
    isMobile: width < MOBILE,
    isTablet: width >= MOBILE && width < TABLET,
    isDesktop: width >= TABLET,
  };
}
