import React, { createContext, useContext, useLayoutEffect, useRef, useState } from 'react';

type Point = { x: number; y: number };
const ViewerPositions = createContext<React.RefObject<Map<string, Point>> | null>(null);

export const ViewerDragProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const positions = useRef(new Map<string, Point>());
  return <ViewerPositions.Provider value={positions}>{children}</ViewerPositions.Provider>;
};

interface DraggableViewerItemProps {
  id: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  wholeSurface?: boolean;
}

/** Move interface overlays without forwarding gestures to the scene underneath. */
export const DraggableViewerItem: React.FC<DraggableViewerItemProps> = ({ id, className = '', style, children, wholeSurface = false }) => {
  const positions = useContext(ViewerPositions);
  const elementRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef<Point>({ x: 0, y: 0 });
  const [offset, setOffset] = useState(offsetRef.current);
  const dragRef = useRef<{ pointerId: number; pointerX: number; pointerY: number; start: Point; capture: HTMLElement; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);

  const moveTo = (point: Point) => {
    const element = elementRef.current;
    const boundary = element?.closest('[data-viewer-boundary]');
    if (!element || !boundary) return;
    const bounds = boundary.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const marginX = rect.width > bounds.width - 8 ? 0 : 4;
    const minY = id === 'Viewer toolbar' ? 0 : 32;
    const x = Math.max(marginX, Math.min(Math.max(marginX, bounds.width - rect.width - marginX), point.x));
    const y = Math.max(minY, Math.min(Math.max(minY, bounds.height - rect.height - 4), point.y));
    const next = { x: x - (rect.left - bounds.left - offsetRef.current.x), y: y - (rect.top - bounds.top - offsetRef.current.y) };
    positions?.current.set(id, { x, y });
    if (Math.abs(next.x - offsetRef.current.x) > 0.1 || Math.abs(next.y - offsetRef.current.y) > 0.1) {
      offsetRef.current = next;
      // Keep geometry reads accurate between pointer events and React's next paint.
      element.style.translate = `${next.x}px ${next.y}px`;
      setOffset(next);
    }
  };

  useLayoutEffect(() => {
    const element = elementRef.current;
    const boundary = element?.closest('[data-viewer-boundary]');
    if (!element || !boundary) return;
    const fit = () => {
      const saved = positions?.current.get(id);
      if (saved) moveTo(saved);
      else {
        const rect = element.getBoundingClientRect();
        const bounds = boundary.getBoundingClientRect();
        const x = rect.left - bounds.left;
        const y = rect.top - bounds.top;
        // Preserve the initial layout unless a panel would be outside its viewer.
        if (x < 0 || y < 0 || rect.right > bounds.right || rect.bottom > bounds.bottom) moveTo({ x, y });
      }
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    observer.observe(boundary);
    return () => observer.disconnect();
  }, [id, positions]);

  const finishDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    if (drag.capture.hasPointerCapture(event.pointerId)) drag.capture.releasePointerCapture(event.pointerId);
    if (drag.moved) {
      event.stopPropagation();
      suppressClickRef.current = true;
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
  };

  return <div
    ref={elementRef}
    data-viewer-draggable={id}
    data-viewer-drag-handle={wholeSurface || undefined}
    className={`${wholeSurface ? 'cursor-move touch-none ' : ''}${className}`}
    style={{ ...style, translate: `${offset.x}px ${offset.y}px` }}
    onPointerDown={(event) => {
      if (event.button !== 0) return;
      const target = event.target as HTMLElement;
      const handle = target.closest('[data-viewer-drag-handle]');
      if (!handle || !event.currentTarget.contains(handle)) return;
      const control = target.closest('button, input, textarea, select, a, [contenteditable="true"]');
      if (control && !control.hasAttribute('data-viewer-drag-handle')) return;
      const bounds = event.currentTarget.closest('[data-viewer-boundary]')?.getBoundingClientRect();
      if (!bounds) return;
      const rect = event.currentTarget.getBoundingClientRect();
      dragRef.current = { pointerId: event.pointerId, pointerX: event.clientX, pointerY: event.clientY, start: { x: rect.left - bounds.left, y: rect.top - bounds.top }, capture: target, moved: false };
      target.setPointerCapture(event.pointerId);
      event.stopPropagation();
    }}
    onPointerMove={(event) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = event.clientX - drag.pointerX;
      const dy = event.clientY - drag.pointerY;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true;
      suppressClickRef.current = true;
      event.preventDefault();
      event.stopPropagation();
      moveTo({ x: drag.start.x + dx, y: drag.start.y + dy });
    }}
    onPointerUp={finishDrag}
    onPointerCancel={finishDrag}
    onLostPointerCapture={finishDrag}
    onClickCapture={(event) => { if (suppressClickRef.current) { event.preventDefault(); event.stopPropagation(); suppressClickRef.current = false; } }}
  >{children}</div>;
};
