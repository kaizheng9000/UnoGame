import { useEffect, useState } from 'react';

export function useBreakpoint() {
  const [width, setWidth] = useState(1024); // SSR-safe default

  useEffect(() => {
    setWidth(window.innerWidth);
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return {
    isMobile: width < 640,
    isTablet: width < 1024,
    width,
  };
}
