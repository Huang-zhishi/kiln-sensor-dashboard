'use client';

import { ReactNode } from 'react';
import { useDraggable, Position } from '@/hooks/useDraggable';

interface DraggableWrapperProps {
  id: string;
  initialPosition: Position;
  children: ReactNode;
  onPositionChange?: (id: string, position: Position) => void;
}

export function DraggableWrapper({
  id,
  initialPosition,
  children,
  onPositionChange,
}: DraggableWrapperProps) {
  const { position, isDragging, handlers } = useDraggable(initialPosition);

  const handleMouseDown = (e: React.MouseEvent) => {
    handlers.onMouseDown(e);
  };

  return (
    <g
      transform={`translate(${position.x}, ${position.y})`}
      onMouseDown={handleMouseDown}
      style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
    >
      {children}
    </g>
  );
}
