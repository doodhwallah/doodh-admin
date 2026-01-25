import { useState, useRef, useCallback } from "react";
import { motion, useMotionValue, useTransform } from "framer-motion";
import { Loader2, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { triggerHaptic } from "@/hooks/useCapacitor";

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
}

const PULL_THRESHOLD = 80;

export function PullToRefresh({ 
  onRefresh, 
  children, 
  className,
  disabled = false 
}: PullToRefreshProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const y = useMotionValue(0);
  const pullProgress = useTransform(y, [0, PULL_THRESHOLD], [0, 1]);
  const rotation = useTransform(y, [0, PULL_THRESHOLD], [0, 180]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (disabled || isRefreshing) return;
    
    const container = containerRef.current;
    if (!container || container.scrollTop > 0) return;
    
    startY.current = e.touches[0].clientY;
    setIsPulling(true);
  }, [disabled, isRefreshing]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isPulling || disabled || isRefreshing) return;
    
    const container = containerRef.current;
    if (!container || container.scrollTop > 0) {
      y.set(0);
      return;
    }

    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;
    
    if (diff > 0) {
      // Apply resistance to pull
      const resistance = 0.5;
      const pullDistance = Math.min(diff * resistance, PULL_THRESHOLD * 1.5);
      y.set(pullDistance);
      
      // Trigger haptic at threshold
      if (pullDistance >= PULL_THRESHOLD && y.getPrevious() < PULL_THRESHOLD) {
        triggerHaptic('light');
      }
    }
  }, [isPulling, disabled, isRefreshing, y]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling || disabled) return;
    
    setIsPulling(false);
    
    if (y.get() >= PULL_THRESHOLD && !isRefreshing) {
      setIsRefreshing(true);
      triggerHaptic('medium');
      
      try {
        await onRefresh();
        triggerHaptic('success');
      } catch (error) {
        triggerHaptic('error');
      } finally {
        setIsRefreshing(false);
      }
    }
    
    y.set(0);
  }, [isPulling, disabled, y, isRefreshing, onRefresh]);

  return (
    <div 
      ref={containerRef}
      className={cn("relative overflow-auto", className)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Pull indicator */}
      <motion.div 
        className="absolute left-0 right-0 flex items-center justify-center pointer-events-none z-10"
        style={{ 
          top: 0,
          height: y,
          opacity: pullProgress
        }}
      >
        <motion.div 
          className={cn(
            "flex items-center justify-center w-10 h-10 rounded-full",
            "bg-primary/10 text-primary"
          )}
        >
          {isRefreshing ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <motion.div style={{ rotate: rotation }}>
              <ArrowDown className="h-5 w-5" />
            </motion.div>
          )}
        </motion.div>
      </motion.div>
      
      {/* Content */}
      <motion.div style={{ y: isRefreshing ? 60 : y }}>
        {children}
      </motion.div>
    </div>
  );
}
