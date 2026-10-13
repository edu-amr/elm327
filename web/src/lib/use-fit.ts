import { useEffect, useRef, useState } from 'react';

/** How many rows of `rowHeight` fit in the element; re-measured when it resizes. */
export function useFitCount<T extends HTMLElement>(rowHeight: number, min = 1) {
  const ref = useRef<T>(null);
  const [count, setCount] = useState(8);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = (): void => setCount(Math.max(min, Math.floor(node.clientHeight / rowHeight)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [rowHeight, min]);

  return { ref, count };
}
