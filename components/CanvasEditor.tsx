import React, { useRef, useEffect, useState, MouseEvent, KeyboardEvent } from 'react';
import { ProjectState, AppStep, GridLine, Column } from '../types';

interface CanvasEditorProps {
  step: AppStep;
  project: ProjectState;
  setProject: React.Dispatch<React.SetStateAction<ProjectState>>;
  currentTool: 'v-line' | 'h-line' | 'select' | null;
}

export const CanvasEditor: React.FC<CanvasEditorProps> = ({ step, project, setProject, currentTool }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number, y: number } | null>(null);

  // Constants for rendering colors
  const LINE_COLOR = '#3b82f6'; // Blue-500
  const TEXT_COLOR = '#1e293b'; // Slate-800
  const COL_COLOR = '#0f172a'; // Slate-900
  
  // Helper to get intersections
  const getIntersections = () => {
    const vLines = project.gridLines.filter(l => l.orientation === 'vertical');
    const hLines = project.gridLines.filter(l => l.orientation === 'horizontal');
    const intersects: { id: string, x: number, y: number, r: number }[] = [];

    const hitRadius = Math.max(15, project.imageWidth / 100);

    vLines.forEach(v => {
      hLines.forEach(h => {
        intersects.push({
          id: `${v.label}-${h.label}`,
          x: v.position,
          y: h.position,
          r: hitRadius
        });
      });
    });
    return intersects;
  };

  const getNextLabel = (orientation: 'vertical' | 'horizontal') => {
    const lines = project.gridLines.filter(l => l.orientation === orientation);
    if (orientation === 'vertical') {
      if (lines.length === 0) return 'A';
      const last = lines[lines.length - 1].label;
      const code = last.charCodeAt(0);
      if (code >= 65 && code <= 90) return String.fromCharCode(code + 1); 
      if (code >= 97 && code <= 122) return String.fromCharCode(code + 1); 
      return 'A'; 
    } else {
      if (lines.length === 0) return '1';
      const nums = lines.map(l => parseInt(l.label)).filter(n => !isNaN(n));
      if (nums.length > 0) return (Math.max(...nums) + 1).toString();
      return (lines.length + 1).toString();
    }
  };

  const addGridLineAt = (x: number, y: number) => {
    if (step !== AppStep.GRID_MAPPING) return;

    if (currentTool === 'v-line') {
      // Small timeout to let the UI rendering finish before the alert freezes it
      setTimeout(() => {
        const defaultLabel = getNextLabel('vertical');
        const label = prompt("Enter Grid Label (e.g., A, B, C):", defaultLabel);
        if (label !== null) { 
          const finalLabel = label.trim() || defaultLabel;
          const newLine: GridLine = {
            id: Math.random().toString(36).substr(2, 9),
            label: finalLabel,
            position: x,
            orientation: 'vertical'
          };
          setProject(prev => ({ ...prev, gridLines: [...prev.gridLines, newLine] }));
        }
      }, 10);
    } else if (currentTool === 'h-line') {
      setTimeout(() => {
        const defaultLabel = getNextLabel('horizontal');
        const label = prompt("Enter Grid Label (e.g., 1, 2, 3):", defaultLabel);
        if (label !== null) {
          const finalLabel = label.trim() || defaultLabel;
          const newLine: GridLine = {
            id: Math.random().toString(36).substr(2, 9),
            label: finalLabel,
            position: y,
            orientation: 'horizontal'
          };
          setProject(prev => ({ ...prev, gridLines: [...prev.gridLines, newLine] }));
        }
      }, 10);
    }
  };

  // --- CHANGED: Handle Key Down directly on the container ---
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      if (hoverPos) {
        e.preventDefault();
        addGridLineAt(hoverPos.x, hoverPos.y);
      } else {
        console.log("Enter pressed, but no hover position found");
      }
    }
  };

  // Draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !project.imageSrc) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.src = project.imageSrc;
    
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, project.imageWidth, project.imageHeight);

      const baseScale = Math.max(1, project.imageWidth / 1000);
      const lineWidth = 2 * baseScale;
      const fontSize = 14 * baseScale;
      const labelBoxSize = 20 * baseScale;
      const dashSize = 5 * baseScale;

      ctx.lineWidth = lineWidth;
      ctx.font = `bold ${fontSize}px Inter, sans-serif`;

      // Draw Grid Lines
      project.gridLines.forEach(line => {
        ctx.beginPath();
        ctx.strokeStyle = LINE_COLOR;
        ctx.setLineDash([dashSize, dashSize]);
        
        if (line.orientation === 'vertical') {
          ctx.moveTo(line.position, 0);
          ctx.lineTo(line.position, canvas.height);
          
          ctx.fillStyle = '#eff6ff';
          ctx.fillRect(line.position - (labelBoxSize/2), dashSize, labelBoxSize, labelBoxSize);
          
          ctx.fillStyle = TEXT_COLOR;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(line.label, line.position, dashSize + (labelBoxSize/2));
        } else {
          ctx.moveTo(0, line.position);
          ctx.lineTo(canvas.width, line.position);

          ctx.fillStyle = '#eff6ff';
          ctx.fillRect(dashSize, line.position - (labelBoxSize/2), labelBoxSize, labelBoxSize);

          ctx.fillStyle = TEXT_COLOR;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(line.label, dashSize + (labelBoxSize/2), line.position);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // Draw Columns
      const intersections = getIntersections();
      const colSize = 20 * baseScale;
      const footingSize = 60 * baseScale;

      project.columns.forEach(col => {
        const intersection = intersections.find(i => i.id === col.intersectionId);
        if (intersection) {
           ctx.strokeStyle = '#dc2626';
           ctx.lineWidth = lineWidth;
           ctx.setLineDash([dashSize, dashSize/2]);
           ctx.strokeRect(intersection.x - footingSize/2, intersection.y - footingSize/2, footingSize, footingSize);
           
           ctx.fillStyle = COL_COLOR;
           ctx.setLineDash([]);
           ctx.fillRect(intersection.x - colSize/2, intersection.y - colSize/2, colSize, colSize);
        }
      });

      // Draw Tool Previews / Hover Effects
      if (hoverPos) {
        if (step === AppStep.GRID_MAPPING) {
          ctx.beginPath();
          ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)';
          ctx.lineWidth = lineWidth;
          if (currentTool === 'v-line') {
            ctx.moveTo(hoverPos.x, 0);
            ctx.lineTo(hoverPos.x, canvas.height);
          } else if (currentTool === 'h-line') {
            ctx.moveTo(0, hoverPos.y);
            ctx.lineTo(canvas.width, hoverPos.y);
          }
          ctx.stroke();
        } 
        
        if (step === AppStep.COLUMN_SELECTION) {
          const hitRadius = Math.max(15, project.imageWidth / 100);
          const nearest = intersections.find(i => 
            Math.hypot(i.x - hoverPos.x, i.y - hoverPos.y) < hitRadius
          );

          if (nearest) {
            ctx.beginPath();
            ctx.fillStyle = 'rgba(16, 185, 129, 0.5)';
            ctx.arc(nearest.x, nearest.y, colSize/2 + 5, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            const ttW = 50 * baseScale;
            const ttH = 25 * baseScale;
            ctx.fillRect(nearest.x + colSize, nearest.y - colSize, ttW, ttH);
            ctx.fillStyle = '#fff';
            ctx.font = `${fontSize}px sans-serif`;
            ctx.fillText(nearest.id, nearest.x + colSize + ttW/2, nearest.y - colSize + ttH/2);
          }
        }
      }
    };
  }, [project, hoverPos, currentTool, step]);

  const handleCanvasClick = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    if (step === AppStep.GRID_MAPPING) {
      addGridLineAt(x, y);
    } else if (step === AppStep.COLUMN_SELECTION) {
       const intersections = getIntersections();
       const hitRadius = Math.max(15, project.imageWidth / 100);
       const clicked = intersections.find(i => Math.hypot(i.x - x, i.y - y) < hitRadius);
       
       if (clicked) {
         setProject(prev => {
            const exists = prev.columns.find(c => c.intersectionId === clicked.id);
            if (exists) {
              return { ...prev, columns: prev.columns.filter(c => c.intersectionId !== clicked.id)};
            } else {
              return { 
                ...prev, 
                columns: [...prev.columns, { 
                  intersectionId: clicked.id, 
                  width: 20, height: 20, type: 'square' 
                }]
              };
            }
         });
       }
    }
  };

  const handleMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = canvasRef.current.width / rect.width;
    const scaleY = canvasRef.current.height / rect.height;

    setHoverPos({
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY
    });
  };

  const handleMouseEnter = () => {
    // Auto-focus the div when mouse enters so keyboard works immediately
    containerRef.current?.focus();
  };

  return (
    <div 
      ref={containerRef} 
      tabIndex={0} // Make div focusable
      onKeyDown={handleKeyDown} // Listen for keys on this div
      onMouseEnter={handleMouseEnter} // Focus when hovering
      className="relative w-full h-full overflow-auto bg-slate-900 flex justify-center items-center shadow-inner outline-none"
    >
      {project.imageSrc ? (
        <canvas
          ref={canvasRef}
          width={project.imageWidth}
          height={project.imageHeight}
          onClick={handleCanvasClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverPos(null)}
          className={`shadow-2xl border border-slate-700 bg-white max-w-none flex-shrink-0 ${
             currentTool === 'v-line' ? 'cursor-col-resize' : 
             currentTool === 'h-line' ? 'cursor-row-resize' : 
             'cursor-crosshair'
          }`}
        />
      ) : (
        <div className="text-slate-500 flex flex-col items-center">
          <svg className="w-16 h-16 mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          <p>No Plan Uploaded</p>
        </div>
      )}
    </div>
  );
};