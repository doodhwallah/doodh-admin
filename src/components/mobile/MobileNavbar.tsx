import { Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useUserRole } from "@/hooks/useUserRole";
import {
  LayoutDashboard,
  Truck,
  Users,
  Package,
  Menu,
  Beef,
  Droplets,
  Receipt,
  Stethoscope,
  Wallet,
  BarChart3,
  Settings,
  LogOut,
  Bell,
  Wheat,
  Baby,
  Wrench,
  MapPin,
  DollarSign,
  Activity,
  UsersRound,
  Milk,
  X,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";
import { triggerHaptic } from "@/hooks/useCapacitor";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  section: string;
}

// All navigation items
const allNavItems: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, section: "main" },
  { title: "Cattle", href: "/cattle", icon: Beef, section: "cattle" },
  { title: "Production", href: "/production", icon: Droplets, section: "production" },
  { title: "Products", href: "/products", icon: Milk, section: "main" },
  { title: "Customers", href: "/customers", icon: Users, section: "customers" },
  { title: "Deliveries", href: "/deliveries", icon: Truck, section: "deliveries" },
  { title: "Routes", href: "/routes", icon: MapPin, section: "deliveries" },
  { title: "Billing", href: "/billing", icon: Receipt, section: "billing" },
  { title: "Bottles", href: "/bottles", icon: Package, section: "bottles" },
  { title: "Health", href: "/health", icon: Stethoscope, section: "health" },
  { title: "Breeding", href: "/breeding", icon: Baby, section: "health" },
  { title: "Inventory", href: "/inventory", icon: Wheat, section: "inventory" },
  { title: "Equipment", href: "/equipment", icon: Wrench, section: "inventory" },
  { title: "Expenses", href: "/expenses", icon: Wallet, section: "expenses" },
  { title: "Price Rules", href: "/price-rules", icon: DollarSign, section: "billing" },
  { title: "Reports", href: "/reports", icon: BarChart3, section: "reports" },
  { title: "Employees", href: "/employees", icon: UsersRound, section: "employees" },
  { title: "Users", href: "/users", icon: UsersRound, section: "users" },
  { title: "Notifications", href: "/notifications", icon: Bell, section: "notifications" },
  { title: "Audit Logs", href: "/audit-logs", icon: Activity, section: "audit" },
  { title: "Settings", href: "/settings", icon: Settings, section: "settings" },
];

// Define which sections each role can access
const roleSections: Record<string, string[]> = {
  super_admin: ["main", "cattle", "production", "customers", "deliveries", "billing", "bottles", "health", "inventory", "expenses", "reports", "settings", "users", "employees", "notifications", "audit"],
  manager: ["main", "cattle", "production", "customers", "deliveries", "billing", "bottles", "health", "inventory", "expenses", "reports", "settings", "employees", "notifications"],
  accountant: ["main", "billing", "expenses", "reports", "customers", "employees"],
  delivery_staff: ["main", "deliveries", "customers", "bottles"],
  farm_worker: ["main", "cattle", "production", "health", "inventory"],
  vet_staff: ["main", "cattle", "health"],
  auditor: ["main", "billing", "expenses", "reports", "audit"],
};

// Primary nav items for bottom bar (max 4)
const getPrimaryNavItems = (role: string | null): NavItem[] => {
  switch (role) {
    case "delivery_staff":
      return [
        allNavItems.find(i => i.href === "/dashboard")!,
        allNavItems.find(i => i.href === "/deliveries")!,
        allNavItems.find(i => i.href === "/customers")!,
        allNavItems.find(i => i.href === "/bottles")!,
      ];
    case "farm_worker":
      return [
        allNavItems.find(i => i.href === "/dashboard")!,
        allNavItems.find(i => i.href === "/cattle")!,
        allNavItems.find(i => i.href === "/production")!,
        allNavItems.find(i => i.href === "/health")!,
      ];
    case "vet_staff":
      return [
        allNavItems.find(i => i.href === "/dashboard")!,
        allNavItems.find(i => i.href === "/cattle")!,
        allNavItems.find(i => i.href === "/health")!,
        allNavItems.find(i => i.href === "/breeding")!,
      ];
    case "accountant":
      return [
        allNavItems.find(i => i.href === "/dashboard")!,
        allNavItems.find(i => i.href === "/billing")!,
        allNavItems.find(i => i.href === "/expenses")!,
        allNavItems.find(i => i.href === "/reports")!,
      ];
    case "auditor":
      return [
        allNavItems.find(i => i.href === "/dashboard")!,
        allNavItems.find(i => i.href === "/billing")!,
        allNavItems.find(i => i.href === "/audit-logs")!,
        allNavItems.find(i => i.href === "/reports")!,
      ];
    default: // super_admin, manager
      return [
        allNavItems.find(i => i.href === "/dashboard")!,
        allNavItems.find(i => i.href === "/deliveries")!,
        allNavItems.find(i => i.href === "/production")!,
        allNavItems.find(i => i.href === "/customers")!,
      ];
  }
};

interface MobileNavbarProps {
  onLogout?: () => void;
}

export function MobileNavbar({ onLogout }: MobileNavbarProps) {
  const location = useLocation();
  const { role } = useUserRole();
  const [open, setOpen] = useState(false);

  // Get sections this role can access
  const allowedSections = role ? roleSections[role] || [] : [];
  
  // Filter all nav items based on role
  const visibleNavItems = allNavItems.filter(item => 
    allowedSections.includes(item.section)
  );

  // Get primary items for bottom bar
  const primaryItems = getPrimaryNavItems(role);

  const handleNavClick = () => {
    triggerHaptic('light');
  };

  const handleMoreClick = () => {
    triggerHaptic('medium');
  };

  return (
    <>
      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur-lg supports-[backdrop-filter]:bg-background/80 md:hidden safe-area-bottom">
        <div className="flex items-center justify-around py-1 px-2">
          {primaryItems.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={handleNavClick}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-3 py-2 text-[10px] transition-all duration-200 min-w-[64px] touch-target",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground active:scale-95"
                )}
              >
                <div className={cn(
                  "flex items-center justify-center h-7 w-7 rounded-lg transition-colors",
                  isActive && "bg-primary/10"
                )}>
                  <item.icon className={cn("h-5 w-5", isActive && "text-primary")} />
                </div>
                <span className="font-medium">{item.title}</span>
              </Link>
            );
          })}
          
          {/* More Menu */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button 
                onClick={handleMoreClick}
                className="flex flex-col items-center gap-0.5 px-3 py-2 text-[10px] text-muted-foreground touch-target relative"
              >
                <div className="flex items-center justify-center h-7 w-7 rounded-lg">
                  <Menu className="h-5 w-5" />
                </div>
                <span className="font-medium">More</span>
              </button>
            </SheetTrigger>
            <SheetContent side="bottom" className="h-[85vh] rounded-t-3xl">
              <SheetHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <SheetTitle>Menu</SheetTitle>
                  <SheetClose asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <X className="h-4 w-4" />
                    </Button>
                  </SheetClose>
                </div>
              </SheetHeader>
              
              <ScrollArea className="h-[calc(85vh-120px)]">
                <div className="grid grid-cols-3 gap-3 py-2">
                  {visibleNavItems.map((item) => {
                    const isActive = location.pathname === item.href;
                    
                    return (
                      <Link
                        key={item.href}
                        to={item.href}
                        onClick={() => {
                          triggerHaptic('light');
                          setOpen(false);
                        }}
                        className={cn(
                          "flex flex-col items-center gap-2 rounded-xl border p-4 transition-all duration-200 touch-target relative",
                          isActive
                            ? "border-primary bg-primary/5 text-primary"
                            : "border-border bg-card hover:bg-muted active:scale-95"
                        )}
                      >
                        <item.icon className={cn("h-6 w-6", isActive && "text-primary")} />
                        <span className="text-xs font-medium text-center leading-tight">{item.title}</span>
                      </Link>
                    );
                  })}
                </div>
                
                <Separator className="my-4" />
                
                {/* Logout button */}
                {onLogout && (
                  <Button
                    variant="outline"
                    className="w-full h-12 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
                    onClick={() => {
                      triggerHaptic('medium');
                      onLogout();
                      setOpen(false);
                    }}
                  >
                    <LogOut className="h-5 w-5 mr-2" />
                    Logout
                  </Button>
                )}
              </ScrollArea>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </>
  );
}