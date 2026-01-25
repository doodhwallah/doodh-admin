import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLedgerAutomation } from "@/hooks/useLedgerAutomation";
import { Loader2, Plus, Trash2, PackagePlus } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

interface Customer {
  id: string;
  name: string;
  area: string | null;
}

interface Product {
  id: string;
  name: string;
  base_price: number;
  unit: string;
}

interface AddonProduct {
  id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  total: number;
}

interface AddonDeliveryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
  preselectedCustomerId?: string;
}

export function AddonDeliveryDialog({
  open,
  onOpenChange,
  onComplete,
  preselectedCustomerId,
}: AddonDeliveryDialogProps) {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(preselectedCustomerId || "");
  const [deliveryDate, setDeliveryDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [notes, setNotes] = useState("");
  const [addonProducts, setAddonProducts] = useState<AddonProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const { toast } = useToast();
  const { logDeliveryCharge } = useLedgerAutomation();

  useEffect(() => {
    if (open) {
      fetchData();
      if (preselectedCustomerId) {
        setSelectedCustomerId(preselectedCustomerId);
      }
    }
  }, [open, preselectedCustomerId]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [customerRes, productRes] = await Promise.all([
        supabase
          .from("customers")
          .select("id, name, area")
          .eq("is_active", true)
          .order("name"),
        supabase
          .from("products")
          .select("id, name, base_price, unit")
          .eq("is_active", true)
          .order("name"),
      ]);

      setCustomers(customerRes.data || []);
      setProducts(productRes.data || []);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddProduct = () => {
    setAddonProducts([
      ...addonProducts,
      {
        id: crypto.randomUUID(),
        product_id: "",
        product_name: "",
        quantity: 1,
        unit: "",
        unit_price: 0,
        total: 0,
      },
    ]);
  };

  const handleRemoveProduct = (id: string) => {
    setAddonProducts(addonProducts.filter((p) => p.id !== id));
  };

  const handleProductChange = (id: string, productId: string) => {
    const product = products.find((p) => p.id === productId);
    if (product) {
      setAddonProducts(
        addonProducts.map((p) =>
          p.id === id
            ? {
                ...p,
                product_id: productId,
                product_name: product.name,
                unit: product.unit,
                unit_price: product.base_price,
                total: p.quantity * product.base_price,
              }
            : p
        )
      );
    }
  };

  const handleQuantityChange = (id: string, quantity: number) => {
    setAddonProducts(
      addonProducts.map((p) =>
        p.id === id
          ? { ...p, quantity, total: quantity * p.unit_price }
          : p
      )
    );
  };

  const handlePriceChange = (id: string, price: number) => {
    setAddonProducts(
      addonProducts.map((p) =>
        p.id === id
          ? { ...p, unit_price: price, total: p.quantity * price }
          : p
      )
    );
  };

  const grandTotal = addonProducts.reduce((sum, p) => sum + p.total, 0);

  const handleSave = async () => {
    if (!selectedCustomerId) {
      toast({
        title: "Validation Error",
        description: "Please select a customer",
        variant: "destructive",
      });
      return;
    }

    if (addonProducts.length === 0) {
      toast({
        title: "Validation Error",
        description: "Please add at least one product",
        variant: "destructive",
      });
      return;
    }

    const invalidProducts = addonProducts.filter(
      (p) => !p.product_id || p.quantity <= 0 || p.unit_price <= 0
    );

    if (invalidProducts.length > 0) {
      toast({
        title: "Validation Error",
        description: "Please complete all product details",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    try {
      // 1. Create delivery record marked as delivered
      const { data: delivery, error: deliveryError } = await supabase
        .from("deliveries")
        .insert({
          customer_id: selectedCustomerId,
          delivery_date: deliveryDate,
          status: "delivered",
          delivery_time: new Date().toISOString(),
          notes: notes ? `[ADDON] ${notes}` : "[ADDON] Extra products delivered",
        })
        .select()
        .single();

      if (deliveryError) throw deliveryError;

      // 2. Create delivery items
      const deliveryItems = addonProducts.map((p) => ({
        delivery_id: delivery.id,
        product_id: p.product_id,
        quantity: p.quantity,
        unit_price: p.unit_price,
        total_amount: p.total,
      }));

      const { error: itemsError } = await supabase
        .from("delivery_items")
        .insert(deliveryItems);

      if (itemsError) throw itemsError;

      // 3. Log to customer ledger for billing
      await logDeliveryCharge(
        selectedCustomerId,
        delivery.id,
        grandTotal,
        deliveryDate
      );

      toast({
        title: "Addon Delivery Created",
        description: `₹${grandTotal.toFixed(2)} added to customer balance`,
      });

      // Reset form
      setSelectedCustomerId(preselectedCustomerId || "");
      setDeliveryDate(format(new Date(), "yyyy-MM-dd"));
      setNotes("");
      setAddonProducts([]);
      onOpenChange(false);
      onComplete();
    } catch (error: any) {
      console.error("Error creating addon delivery:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to create addon delivery",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setSelectedCustomerId(preselectedCustomerId || "");
    setDeliveryDate(format(new Date(), "yyyy-MM-dd"));
    setNotes("");
    setAddonProducts([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackagePlus className="h-5 w-5 text-warning" />
            Addon Delivery
          </DialogTitle>
          <DialogDescription>
            Record extra products requested by customer (instantly marked as delivered)
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-4 py-4">
            {/* Customer Selection */}
            <div className="space-y-2">
              <Label>Customer *</Label>
              <Select
                value={selectedCustomerId}
                onValueChange={setSelectedCustomerId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Search and select customer..." />
                </SelectTrigger>
                <SelectContent>
              {customers.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} {c.area && `(${c.area})`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Delivery Date */}
            <div className="space-y-2">
              <Label>Delivery Date</Label>
              <Input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
            </div>

            {/* Products Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Products *</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddProduct}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Product
                </Button>
              </div>

              {addonProducts.length === 0 && (
                <Card className="border-dashed">
                  <CardContent className="py-6 text-center text-muted-foreground">
                    Click "Add Product" to add items
                  </CardContent>
                </Card>
              )}

              {addonProducts.map((item, index) => (
                <Card key={item.id} className="relative">
                  <CardContent className="pt-4 pb-3">
                    <div className="grid gap-3 sm:grid-cols-12">
                      <div className="sm:col-span-5">
                        <Label className="text-xs">Product</Label>
                        <Select
                          value={item.product_id}
                          onValueChange={(v) => handleProductChange(item.id, v)}
                        >
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Select product" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name} (₹{p.base_price}/{p.unit})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="sm:col-span-2">
                        <Label className="text-xs">Qty</Label>
                        <Input
                          type="number"
                          min={0.1}
                          step={0.1}
                          value={item.quantity}
                          onChange={(e) =>
                            handleQuantityChange(item.id, parseFloat(e.target.value) || 0)
                          }
                          className="mt-1"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <Label className="text-xs">Price/Unit</Label>
                        <Input
                          type="number"
                          min={0}
                          step={0.5}
                          value={item.unit_price}
                          onChange={(e) =>
                            handlePriceChange(item.id, parseFloat(e.target.value) || 0)
                          }
                          className="mt-1"
                        />
                      </div>

                      <div className="sm:col-span-2">
                        <Label className="text-xs">Total</Label>
                        <div className="mt-1 flex h-10 items-center text-sm font-medium">
                          ₹{item.total.toFixed(2)}
                        </div>
                      </div>

                      <div className="sm:col-span-1 flex items-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 text-destructive hover:text-destructive"
                          onClick={() => handleRemoveProduct(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}

              {addonProducts.length > 0 && (
                <div className="flex justify-end text-lg font-semibold">
                  Grand Total: ₹{grandTotal.toFixed(2)}
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="e.g., Customer called at 2pm requesting extra milk"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || addonProducts.length === 0}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <PackagePlus className="h-4 w-4 mr-1" />
            Add Addon Delivery
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
