import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface MobilePageWrapperProps {
  children: React.ReactNode;
  className?: string;
  hasFab?: boolean;
}

export function MobilePageWrapper({ 
  children, 
  className,
  hasFab = false 
}: MobilePageWrapperProps) {
  const isMobile = useIsMobile();

  return (
    <div 
      className={cn(
        "min-h-screen",
        // Add safe area padding on mobile
        isMobile && "safe-area-top safe-area-left safe-area-right",
        // Add bottom padding for mobile nav bar and FAB
        isMobile && "pb-24",
        isMobile && hasFab && "pb-32",
        className
      )}
    >
      {children}
    </div>
  );
}
