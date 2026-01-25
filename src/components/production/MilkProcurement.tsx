import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useExpenseAutomation } from "@/hooks/useExpenseAutomation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { DataTable } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { useToast } from "@/hooks/use-toast";
import { format, subDays } from "date-fns";
import { 
  Truck, 
  Plus, 
  IndianRupee, 
  Loader2, 
  Phone, 
  MapPin,
  Droplets,
  TrendingUp,
  Calendar,
  Pencil,
  Trash2,
  RefreshCw
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";

interface MilkVendor {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
}

interface MilkProcurement {
  id: string;
  procurement_date: string;
  supplier_name: string;
  supplier_phone: string | null;
  supplier_address: string | null;
  quantity_liters: number;
  fat_percentage: number | null;
  snf_percentage: number | null;
  rate_per_liter: number;
  total_amount: number;
  payment_status: string;
  paid_amount: number | null;
  payment_date: string | null;
  payment_mode: string | null;
  vehicle_number: string | null;
  quality_grade: string | null;
  notes: string | null;
  created_at: string;
  vendor_id: string | null;
}

interface ProcurementStats {
  todayQuantity: number;
  todayAmount: number;
  weekQuantity: number;
  pendingPayments: number;
}

const emptyForm = {
  procurement_date: format(new Date(), "yyyy-MM-dd"),
  vendor_id: "",
  supplier_name: "",
  supplier_phone: "",
  supplier_address: "",
  quantity_liters: "",
  fat_percentage: "",
  snf_percentage: "",
  rate_per_liter: "",
  payment_status: "pending",
  paid_amount: "",
  payment_mode: "",
  vehicle_number: "",
  quality_grade: "",
  notes: "",
};

type FormState = typeof emptyForm;

export function MilkProcurement() {
  const [vendors, setVendors] = useState<MilkVendor[]>([]);
  const [procurements, setProcurements] = useState<MilkProcurement[]>([]);
  const [stats, setStats] = useState<ProcurementStats>({
    todayQuantity: 0,
    todayAmount: 0,
    weekQuantity: 0,
    pendingPayments: 0,
  });
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedProcurement, setSelectedProcurement] = useState<MilkProcurement | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("cash");
  const [form, setForm] = useState<FormState>(emptyForm);
  const { toast } = useToast();
  const { logMilkProcurementPayment } = useExpenseAutomation();
  const queryClient = useQueryClient();

  // Fetch vendors with error handling and retry
  const fetchVendors = useCallback(async (retryCount = 0) => {
    const maxRetries = 3;
    try {
      const { data, error } = await supabase
        .from("milk_vendors")
        .select("id, name, phone, address")
        .eq("is_active", true)
        .order("name");
      
      if (error) {
        if (retryCount < maxRetries && error.message?.includes('fetch')) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
          return fetchVendors(retryCount + 1);
        }
        console.error("Error fetching vendors:", error);
        return;
      }
      setVendors(data || []);
    } catch (err) {
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
        return fetchVendors(retryCount + 1);
      }
      console.error("Unexpected error fetching vendors:", err);
    }
  }, []);

  const fetchData = useCallback(async (retryCount = 0) => {
    const maxRetries = 3;
    setLoading(true);
    setFetchError(null);
    const today = format(new Date(), "yyyy-MM-dd");
    const weekAgo = format(subDays(new Date(), 7), "yyyy-MM-dd");

    try {
      const { data, error } = await supabase
        .from("milk_procurement")
        .select("*")
        .order("procurement_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        if (retryCount < maxRetries && error.message?.includes('fetch')) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
          return fetchData(retryCount + 1);
        }
        setFetchError(error.message || "Failed to load procurement data");
        toast({
          title: "Error fetching procurement data",
          description: "Please check your connection and try again.",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }
      
      const records = data || [];
      setProcurements(records);
      
      // Calculate stats with safe number handling
      const todayData = records.filter(p => p.procurement_date === today);
      const weekData = records.filter(p => p.procurement_date >= weekAgo);
      const pending = records.filter(p => p.payment_status !== "paid");
      
      setStats({
        todayQuantity: todayData.reduce((sum, p) => sum + (Number(p.quantity_liters) || 0), 0),
        todayAmount: todayData.reduce((sum, p) => sum + (Number(p.total_amount) || 0), 0),
        weekQuantity: weekData.reduce((sum, p) => sum + (Number(p.quantity_liters) || 0), 0),
        pendingPayments: pending.reduce((sum, p) => sum + ((Number(p.total_amount) || 0) - (Number(p.paid_amount) || 0)), 0),
      });
      
      setLoading(false);
    } catch (err) {
      if (retryCount < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
        return fetchData(retryCount + 1);
      }
      console.error("Unexpected error fetching procurement data:", err);
      setFetchError("Network error. Please check your connection.");
      toast({
        title: "Error",
        description: "Failed to load procurement data. Please try again.",
        variant: "destructive",
      });
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
    fetchVendors();
  }, [fetchData, fetchVendors]);

  // Manual retry function for user-initiated retries
  const handleRetry = () => {
    fetchData();
    fetchVendors();
  };

  const calculateTotal = (quantity: string, rate: string) => {
    const qty = parseFloat(quantity) || 0;
    const r = parseFloat(rate) || 0;
    return (qty * r).toFixed(2);
  };

  const handleSave = async () => {
    if (!form.supplier_name || !form.quantity_liters || !form.rate_per_liter) {
      toast({
        title: "Validation Error",
        description: "Please fill in supplier name, quantity, and rate",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    const totalAmount = parseFloat(calculateTotal(form.quantity_liters, form.rate_per_liter));

    const record = {
      procurement_date: form.procurement_date,
      vendor_id: form.vendor_id || null,
      supplier_name: form.supplier_name,
      supplier_phone: form.supplier_phone || null,
      supplier_address: form.supplier_address || null,
      quantity_liters: parseFloat(form.quantity_liters),
      fat_percentage: form.fat_percentage ? parseFloat(form.fat_percentage) : null,
      snf_percentage: form.snf_percentage ? parseFloat(form.snf_percentage) : null,
      rate_per_liter: parseFloat(form.rate_per_liter),
      total_amount: totalAmount,
      payment_status: form.payment_status,
      paid_amount: form.paid_amount ? parseFloat(form.paid_amount) : 0,
      payment_mode: form.payment_mode || null,
      vehicle_number: form.vehicle_number || null,
      quality_grade: form.quality_grade || null,
      notes: form.notes || null,
    };

    let error;
    if (editingId) {
      const { error: updateError } = await supabase
        .from("milk_procurement")
        .update(record)
        .eq("id", editingId);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from("milk_procurement")
        .insert(record);
      error = insertError;
    }

    setSaving(false);

    if (error) {
      toast({
        title: "Error saving procurement",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: editingId ? "Procurement updated" : "Procurement recorded",
        description: `${form.quantity_liters}L from ${form.supplier_name} @ ₹${form.rate_per_liter}/L`,
      });
      setDialogOpen(false);
      resetForm();
      fetchData();
    }
  };

  const handleEdit = (procurement: MilkProcurement) => {
    if (!procurement) return;
    
    setEditingId(procurement.id);
    setForm({
      procurement_date: procurement.procurement_date || format(new Date(), "yyyy-MM-dd"),
      vendor_id: procurement.vendor_id || "",
      supplier_name: procurement.supplier_name || "",
      supplier_phone: procurement.supplier_phone || "",
      supplier_address: procurement.supplier_address || "",
      quantity_liters: String(procurement.quantity_liters ?? ""),
      fat_percentage: procurement.fat_percentage != null ? String(procurement.fat_percentage) : "",
      snf_percentage: procurement.snf_percentage != null ? String(procurement.snf_percentage) : "",
      rate_per_liter: String(procurement.rate_per_liter ?? ""),
      payment_status: procurement.payment_status || "pending",
      paid_amount: procurement.paid_amount != null ? String(procurement.paid_amount) : "",
      payment_mode: procurement.payment_mode || "",
      vehicle_number: procurement.vehicle_number || "",
      quality_grade: procurement.quality_grade || "",
      notes: procurement.notes || "",
    });
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedProcurement) return;

    const { error } = await supabase
      .from("milk_procurement")
      .delete()
      .eq("id", selectedProcurement.id);

    if (error) {
      toast({
        title: "Error deleting procurement",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Procurement deleted",
        description: "Record has been removed",
      });
      fetchData();
    }
    setDeleteDialogOpen(false);
    setSelectedProcurement(null);
  };

  const handleRecordPayment = async () => {
    if (!selectedProcurement || !paymentAmount) return;

    const newPaidAmount = Number(selectedProcurement.paid_amount || 0) + parseFloat(paymentAmount);
    const newStatus = newPaidAmount >= selectedProcurement.total_amount ? "paid" : "partial";

    const { error } = await supabase
      .from("milk_procurement")
      .update({
        paid_amount: newPaidAmount,
        payment_status: newStatus,
        payment_date: format(new Date(), "yyyy-MM-dd"),
        payment_mode: paymentMode,
      })
      .eq("id", selectedProcurement.id);

    if (error) {
      toast({
        title: "Error recording payment",
        description: error.message,
        variant: "destructive",
      });
    } else {
      // Log expense for this payment (only when payment is made, not on daily entry)
      const expenseLogged = await logMilkProcurementPayment(
        selectedProcurement.supplier_name,
        parseFloat(paymentAmount),
        format(new Date(), "yyyy-MM-dd"),
        selectedProcurement.id,
        selectedProcurement.quantity_liters
      );

      // Invalidate expenses cache to reflect new entry
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["auto-expense-stats"] });
      queryClient.invalidateQueries({ queryKey: ["vendors"] });

      toast({
        title: "Payment recorded",
        description: `₹${paymentAmount} paid to ${selectedProcurement.supplier_name}${expenseLogged ? ' (expense logged)' : ''}`,
      });
      setPaymentDialogOpen(false);
      setSelectedProcurement(null);
      setPaymentAmount("");
      fetchData();
    }
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const columns = [
    {
      key: "procurement_date",
      header: "Date",
      render: (item: MilkProcurement) => (
        <span className="font-medium">
          {format(new Date(item.procurement_date), "dd MMM yyyy")}
        </span>
      ),
    },
    {
      key: "supplier_name",
      header: "Supplier",
      render: (item: MilkProcurement) => (
        <div>
          <div className="font-medium">{item.supplier_name}</div>
          {item.supplier_phone && (
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Phone className="h-3 w-3" /> {item.supplier_phone}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "quantity_liters",
      header: "Quantity",
      render: (item: MilkProcurement) => (
        <div>
          <span className="font-semibold">{item.quantity_liters} L</span>
          {item.quality_grade && (
            <span className="ml-2 text-xs px-1.5 py-0.5 rounded bg-muted">
              Grade {item.quality_grade}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "quality",
      header: "Fat/SNF",
      render: (item: MilkProcurement) => (
        <div className="text-sm">
          {item.fat_percentage || item.snf_percentage ? (
            <>
              <span>Fat: {item.fat_percentage || "-"}%</span>
              <span className="mx-1">|</span>
              <span>SNF: {item.snf_percentage || "-"}%</span>
            </>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </div>
      ),
    },
    {
      key: "rate_per_liter",
      header: "Rate",
      render: (item: MilkProcurement) => (
        <span>₹{item.rate_per_liter}/L</span>
      ),
    },
    {
      key: "total_amount",
      header: "Amount",
      render: (item: MilkProcurement) => (
        <span className="font-semibold">₹{item.total_amount.toLocaleString()}</span>
      ),
    },
    {
      key: "payment_status",
      header: "Payment",
      render: (item: MilkProcurement) => {
        const statusMap: Record<string, "success" | "warning" | "error"> = {
          paid: "success",
          partial: "warning",
          pending: "error",
        };
        return (
          <div>
            <StatusBadge status={item.payment_status} variant={statusMap[item.payment_status]} />
            {item.paid_amount && item.paid_amount > 0 && item.payment_status !== "paid" && (
              <div className="text-xs text-muted-foreground mt-1">
                Paid: ₹{item.paid_amount}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "Actions",
      render: (item: MilkProcurement) => (
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleEdit(item)}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          {item.payment_status !== "paid" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedProcurement(item);
                setPaymentDialogOpen(true);
              }}
            >
              <IndianRupee className="h-3 w-3" />
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedProcurement(item);
              setDeleteDialogOpen(true);
            }}
          >
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card className="bg-gradient-to-br from-success/10 to-success/5 border-success/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Today's Procurement</p>
                <p className="text-2xl font-bold text-success">{stats.todayQuantity} L</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/20">
                <Droplets className="h-5 w-5 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Today's Cost</p>
                <p className="text-2xl font-bold text-primary">₹{stats.todayAmount.toLocaleString()}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
                <IndianRupee className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-info/10 to-info/5 border-info/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">This Week</p>
                <p className="text-2xl font-bold text-info">{stats.weekQuantity} L</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-info/20">
                <TrendingUp className="h-5 w-5 text-info" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-warning/10 to-warning/5 border-warning/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pending Payments</p>
                <p className="text-2xl font-bold text-warning">₹{stats.pendingPayments.toLocaleString()}</p>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/20">
                <Calendar className="h-5 w-5 text-warning" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Header with Add Button */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            External Milk Procurement
          </CardTitle>
          <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Add Procurement
          </Button>
        </CardHeader>
        <CardContent>
          {fetchError ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="text-destructive mb-4">
                <Truck className="h-12 w-12 mx-auto opacity-50" />
              </div>
              <p className="text-lg font-medium text-destructive mb-2">Failed to load data</p>
              <p className="text-muted-foreground mb-4">{fetchError}</p>
              <Button onClick={handleRetry} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          ) : (
            <DataTable
              data={procurements}
              columns={columns}
              loading={loading}
              searchPlaceholder="Search by supplier, date..."
              emptyMessage="No procurement records yet. Start adding external milk purchases."
            />
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              {editingId ? "Edit Procurement" : "Record Milk Procurement"}
            </DialogTitle>
            <DialogDescription>
              {editingId ? "Update the procurement details" : "Enter details of externally procured milk"}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-4 py-4">
              {/* Row 1: Date and Vendor Selection */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Date *</Label>
                  <Input
                    type="date"
                    value={form.procurement_date}
                    onChange={(e) => setForm({ ...form, procurement_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Select Vendor (Optional)</Label>
                  <Select
                    value={form.vendor_id || "manual"}
                    onValueChange={(value) => {
                      if (value === "manual") {
                        setForm({ ...form, vendor_id: "" });
                        return;
                      }
                      const vendor = vendors.find(v => v.id === value);
                      if (vendor) {
                        setForm({
                          ...form,
                          vendor_id: value,
                          supplier_name: vendor.name,
                          supplier_phone: vendor.phone || "",
                          supplier_address: vendor.address || "",
                        });
                      } else {
                        setForm({ ...form, vendor_id: value });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Choose from saved vendors" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual">-- Manual Entry --</SelectItem>
                      {vendors.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name} {v.phone && `(${v.phone})`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 2: Supplier Name (can be manual or auto-filled) */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Supplier Name *</Label>
                  <Input
                    placeholder="Enter supplier name"
                    value={form.supplier_name}
                    onChange={(e) => setForm({ ...form, supplier_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-1">
                    <Phone className="h-3 w-3" /> Phone
                  </Label>
                  <Input
                    placeholder="Supplier phone"
                    value={form.supplier_phone}
                    onChange={(e) => setForm({ ...form, supplier_phone: e.target.value })}
                  />
                </div>
              </div>

              {/* Row 3: Address */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Address
                </Label>
                <Input
                  placeholder="Supplier address"
                  value={form.supplier_address}
                  onChange={(e) => setForm({ ...form, supplier_address: e.target.value })}
                />
              </div>

              {/* Row 3: Quantity, Rate, Vehicle */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Quantity (Liters) *</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="0.00"
                    value={form.quantity_liters}
                    onChange={(e) => setForm({ ...form, quantity_liters: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Rate per Liter (₹) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={form.rate_per_liter}
                    onChange={(e) => setForm({ ...form, rate_per_liter: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Vehicle Number</Label>
                  <Input
                    placeholder="e.g., UP32XX1234"
                    value={form.vehicle_number}
                    onChange={(e) => setForm({ ...form, vehicle_number: e.target.value })}
                  />
                </div>
              </div>

              {/* Total Amount Display */}
              {form.quantity_liters && form.rate_per_liter && (
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Total Amount</span>
                    <span className="text-xl font-bold">
                      ₹{parseFloat(calculateTotal(form.quantity_liters, form.rate_per_liter)).toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              {/* Row 4: Quality Details */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Fat %</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="e.g., 4.5"
                    value={form.fat_percentage}
                    onChange={(e) => setForm({ ...form, fat_percentage: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>SNF %</Label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="e.g., 8.5"
                    value={form.snf_percentage}
                    onChange={(e) => setForm({ ...form, snf_percentage: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Quality Grade</Label>
                  <Select
                    value={form.quality_grade || "none"}
                    onValueChange={(value) => setForm({ ...form, quality_grade: value === "none" ? "" : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select grade" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- No Grade --</SelectItem>
                      <SelectItem value="A">Grade A (Best)</SelectItem>
                      <SelectItem value="B">Grade B (Good)</SelectItem>
                      <SelectItem value="C">Grade C (Average)</SelectItem>
                      <SelectItem value="D">Grade D (Below Avg)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Row 5: Payment Details */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>Payment Status</Label>
                  <Select
                    value={form.payment_status}
                    onValueChange={(value) => setForm({ ...form, payment_status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="partial">Partial</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Paid Amount</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={form.paid_amount}
                    onChange={(e) => setForm({ ...form, paid_amount: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Payment Mode</Label>
                  <Select
                    value={form.payment_mode || "none"}
                    onValueChange={(value) => setForm({ ...form, payment_mode: value === "none" ? "" : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">-- Not Selected --</SelectItem>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="upi">UPI</SelectItem>
                      <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Notes */}
              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  placeholder="Any additional notes..."
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                />
              </div>
            </div>
          </ScrollArea>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingId ? "Update" : "Save Procurement"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IndianRupee className="h-5 w-5" />
              Record Payment
            </DialogTitle>
            <DialogDescription>
              {selectedProcurement && (
                <>
                  Supplier: <strong>{selectedProcurement.supplier_name}</strong>
                  <br />
                  Pending: <strong>₹{(selectedProcurement.total_amount - (selectedProcurement.paid_amount || 0)).toLocaleString()}</strong>
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Payment Amount (₹)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="Enter amount"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Payment Mode</Label>
              <Select value={paymentMode} onValueChange={setPaymentMode}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="upi">UPI</SelectItem>
                  <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  <SelectItem value="cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPaymentDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleRecordPayment} disabled={!paymentAmount}>
              Record Payment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Procurement Record"
        description={`Are you sure you want to delete this procurement from ${selectedProcurement?.supplier_name}? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </div>
  );
}
