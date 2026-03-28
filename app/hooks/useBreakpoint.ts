import { useEffect, useState } from 'react';

export function useBreakpoint() {
  const [dims, setDims] = useState({ width: 1024, height: 768 });

  useEffect(() => {
    setDims({ width: window.innerWidth, height: window.innerHeight });
    const handler = () => setDims({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return {
    isMobile: dims.width < 640,
    isTablet: dims.width < 1024,
    width: dims.width,
    height: dims.height,
  };
}
