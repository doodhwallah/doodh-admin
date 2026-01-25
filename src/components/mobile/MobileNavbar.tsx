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
  Sun,
  Moon,
  User,
  ShoppingCart,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useState } from "react";
import { triggerHaptic } from "@/hooks/useCapacitor";
import { useTheme } from "next-themes";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

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
  { title: "Milk Production", href: "/production", icon: Droplets, section: "production" },
  { title: "Milk Procurement", href: "/procurement", icon: ShoppingCart, section: "production" },
  { title: "Products", href: "/products", icon: Milk, section: "main" },
  { title: "Customers", href: "/customers", icon: Users, section: "customers" },
  { title: "Deliveries", href: "/deliveries", icon: Truck, section: "deliveries" },
  { title: "Routes", href: "/routes", icon: MapPin, section: "deliveries" },
  { title: "Billing", href: "/billing", icon: Receipt, section: "billing" },
  { title: "Bottles", href: "/bottles", icon: Package, section: "bottles" },
  { title: "Health Records", href: "/health", icon: Stethoscope, section: "health" },
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

// Get role display name
const getRoleDisplayName = (role: string | null): string => {
  const roleNames: Record<string, string> = {
    super_admin: "Super Admin",
    manager: "Manager",
    accountant: "Accountant",
    delivery_staff: "Delivery Staff",
    farm_worker: "Farm Worker",
    vet_staff: "Vet Staff",
    auditor: "Auditor",
  };
  return roleNames[role || ""] || "User";
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
  const { role, userName } = useUserRole();
  const [open, setOpen] = useState(false);
  const { theme, setTheme } = useTheme();

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
    setOpen(true);
  };

  const handleThemeToggle = () => {
    triggerHaptic('light');
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const userInitials = userName 
    ? userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

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
                <span className="font-medium">{item.title.split(' ')[0]}</span>
              </Link>
            );
          })}
          
          {/* More Menu Trigger */}
          <button 
            onClick={handleMoreClick}
            className="flex flex-col items-center gap-0.5 px-3 py-2 text-[10px] text-muted-foreground touch-target relative active:scale-95"
          >
            <div className="flex items-center justify-center h-7 w-7 rounded-lg">
              <Menu className="h-5 w-5" />
            </div>
            <span className="font-medium">More</span>
          </button>
        </div>
      </nav>

      {/* Full Screen Menu Sheet */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent 
          side="right" 
          className="w-[85%] max-w-[320px] p-0 border-l border-border/50 bg-sidebar"
        >
          <SheetHeader className="px-5 pt-5 pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img 
                  src="/images/awadh-dairy-logo.png" 
                  alt="Awadh Dairy" 
                  className="h-10 w-10 object-contain"
                />
                <SheetTitle className="text-sidebar-foreground text-lg font-semibold">Awadh Dairy</SheetTitle>
              </div>
              <SheetClose asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-9 w-9 text-sidebar-foreground hover:bg-sidebar-accent"
                  onClick={() => triggerHaptic('light')}
                >
                  <X className="h-5 w-5" />
                </Button>
              </SheetClose>
            </div>
          </SheetHeader>
          
          <Separator className="bg-sidebar-border" />
          
          <ScrollArea className="h-[calc(100vh-180px)] px-3">
            <div className="flex flex-col gap-1 py-4">
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
                      "flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-200 touch-target",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "text-sidebar-foreground hover:bg-sidebar-accent active:scale-[0.98]"
                    )}
                  >
                    <item.icon className={cn(
                      "h-5 w-5 flex-shrink-0",
                      isActive ? "text-primary-foreground" : "text-sidebar-foreground/80"
                    )} />
                    <span className="text-[15px] font-medium">{item.title}</span>
                  </Link>
                );
              })}
            </div>
            
            <Separator className="my-2 bg-sidebar-border" />
            
            {/* Theme Toggle */}
            <div className="px-3 py-2">
              <button
                onClick={handleThemeToggle}
                className="flex items-center gap-4 w-full px-4 py-3.5 rounded-xl border border-sidebar-border text-sidebar-foreground hover:bg-sidebar-accent transition-all duration-200 active:scale-[0.98]"
              >
                {theme === 'dark' ? (
                  <Sun className="h-5 w-5 text-sidebar-foreground/80" />
                ) : (
                  <Moon className="h-5 w-5 text-sidebar-foreground/80" />
                )}
                <span className="text-[15px] font-medium">
                  {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                </span>
              </button>
            </div>
            
            {/* Settings */}
            <div className="px-3 py-1">
              <Link
                to="/settings"
                onClick={() => {
                  triggerHaptic('light');
                  setOpen(false);
                }}
                className={cn(
                  "flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all duration-200 touch-target",
                  location.pathname === "/settings"
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "text-sidebar-foreground hover:bg-sidebar-accent active:scale-[0.98]"
                )}
              >
                <Settings className={cn(
                  "h-5 w-5",
                  location.pathname === "/settings" ? "text-primary-foreground" : "text-sidebar-foreground/80"
                )} />
                <span className="text-[15px] font-medium">Settings</span>
              </Link>
            </div>
            
            {/* Logout */}
            {onLogout && (
              <div className="px-3 py-1 pb-4">
                <button
                  onClick={() => {
                    triggerHaptic('medium');
                    onLogout();
                    setOpen(false);
                  }}
                  className="flex items-center gap-4 w-full px-4 py-3.5 rounded-xl text-destructive hover:bg-destructive/10 transition-all duration-200 active:scale-[0.98]"
                >
                  <LogOut className="h-5 w-5" />
                  <span className="text-[15px] font-medium">Logout</span>
                </button>
              </div>
            )}
          </ScrollArea>
          
          {/* User Profile Section at Bottom */}
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-sidebar-border bg-sidebar safe-area-bottom">
            <div className="flex items-center gap-3">
              <Avatar className="h-10 w-10 border-2 border-sidebar-border">
                <AvatarFallback className="bg-sidebar-accent text-sidebar-foreground text-sm font-medium">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col min-w-0">
                <span className="text-sm font-semibold text-sidebar-foreground truncate">
                  {userName || 'User'}
                </span>
                <span className="text-xs text-sidebar-foreground/60 flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {getRoleDisplayName(role)}
                </span>
              </div>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
