import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "@/components/common/PageHeader";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MilkProcurement } from "@/components/production/MilkProcurement";
import { VendorManagement } from "@/components/production/VendorManagement";
import { MilkProcurementAnalytics } from "@/components/production/MilkProcurementAnalytics";
import { ShoppingCart, Truck, Users, BarChart3 } from "lucide-react";

type TabValue = "entries" | "vendors" | "analytics";

export default function ProcurementPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabValue>("entries");

  useEffect(() => {
    // Handle URL parameters for deep linking
    const tabParam = searchParams.get("tab");
    if (tabParam === "vendors" || tabParam === "analytics") {
      setActiveTab(tabParam);
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Milk Procurement"
        description="Manage external milk purchases from vendors"
        icon={ShoppingCart}
      />

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabValue)}>
        <TabsList className="grid w-full max-w-md grid-cols-3">
          <TabsTrigger value="entries" className="gap-2">
            <Truck className="h-4 w-4" />
            <span className="hidden sm:inline">Daily</span> Entries
          </TabsTrigger>
          <TabsTrigger value="vendors" className="gap-2">
            <Users className="h-4 w-4" />
            Vendors
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="entries" className="mt-6">
          <MilkProcurement />
        </TabsContent>

        <TabsContent value="vendors" className="mt-6">
          <VendorManagement />
        </TabsContent>

        <TabsContent value="analytics" className="mt-6">
          <MilkProcurementAnalytics />
        </TabsContent>
      </Tabs>
    </div>
  );
}
