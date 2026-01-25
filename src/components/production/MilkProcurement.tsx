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
  Droplets,
  TrendingUp,
  Calendar,
  Pencil,
  Trash2,
  RefreshCw
} from "lucide-react";
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
  session: "morning" as "morning" | "evening",
  quantity_liters: "",
  fat_percentage: "",
  snf_percentage: "",
  rate_per_liter: "",
  payment_status: "pending",
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
    if (!form.vendor_id || !form.quantity_liters || !form.rate_per_liter) {
      toast({
        title: "Validation Error",
        description: "Please select a vendor and fill in quantity and rate",
        variant: "destructive",
      });
      return;
    }

    // Get supplier details from selected vendor
    const selectedVendor = vendors.find(v => v.id === form.vendor_id);
    if (!selectedVendor) {
      toast({
        title: "Validation Error",
        description: "Please select a valid vendor",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    const totalAmount = parseFloat(calculateTotal(form.quantity_liters, form.rate_per_liter));

    // Build base record with only editable fields
    const baseRecord = {
      procurement_date: form.procurement_date,
      vendor_id: form.vendor_id,
      supplier_name: selectedVendor.name,
      supplier_phone: selectedVendor.phone || null,
      supplier_address: selectedVendor.address || null,
      quantity_liters: parseFloat(form.quantity_liters),
      fat_percentage: form.fat_percentage ? parseFloat(form.fat_percentage) : null,
      snf_percentage: form.snf_percentage ? parseFloat(form.snf_percentage) : null,
      rate_per_liter: parseFloat(form.rate_per_liter),
      total_amount: totalAmount,
      vehicle_number: null,
      quality_grade: null,
      notes: form.notes ? `[${form.session.toUpperCase()}] ${form.notes}` : `[${form.session.toUpperCase()}]`,
    };

    // For insert: initialize payment fields; for update: preserve existing payment data
    const record = editingId
      ? baseRecord // Don't overwrite payment fields on update
      : {
          ...baseRecord,
          payment_status: "pending",
          paid_amount: 0,
          payment_mode: null,
          payment_date: null,
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
      const vendorName = vendors.find(v => v.id === form.vendor_id)?.name || "vendor";
      toast({
        title: editingId ? "Procurement updated" : "Procurement recorded",
        description: `${form.quantity_liters}L from ${vendorName} @ ₹${form.rate_per_liter}/L`,
      });
      setDialogOpen(false);
      resetForm();
      fetchData();
    }
  };

  const handleEdit = (procurement: MilkProcurement) => {
    if (!procurement) return;
    
    // Extract session from notes if available
    const sessionMatch = procurement.notes?.match(/^\[(MORNING|EVENING)\]/i);
    const session = sessionMatch ? sessionMatch[1].toLowerCase() as "morning" | "evening" : "morning";
    const cleanNotes = procurement.notes?.replace(/^\[(MORNING|EVENING)\]\s*/i, "") || "";
    
    setEditingId(procurement.id);
    setForm({
      procurement_date: procurement.procurement_date || format(new Date(), "yyyy-MM-dd"),
      vendor_id: procurement.vendor_id || "",
      session: session,
      quantity_liters: String(procurement.quantity_liters ?? ""),
      fat_percentage: procurement.fat_percentage != null ? String(procurement.fat_percentage) : "",
      snf_percentage: procurement.snf_percentage != null ? String(procurement.snf_percentage) : "",
      rate_per_liter: String(procurement.rate_per_liter ?? ""),
      payment_status: procurement.payment_status || "pending",
      notes: cleanNotes,
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

    // Use atomic database function to prevent race conditions
    const { data, error } = await supabase.rpc('record_procurement_payment', {
      p_procurement_id: selectedProcurement.id,
      p_payment_amount: parseFloat(paymentAmount),
      p_payment_mode: paymentMode,
    });

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
        <DialogContent className="max-w-2xl w-[calc(100vw-1.5rem)] sm:w-full max-h-[90vh] h-[85vh] sm:h-auto flex flex-col min-h-0 p-0">
          {/* Fixed Header */}
          <div className="px-6 pt-6 pb-4 border-b shrink-0">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                {editingId ? "Edit Procurement" : "Record Milk Procurement"}
              </DialogTitle>
              <DialogDescription>
                {editingId ? "Update the procurement details" : "Enter details of externally procured milk"}
              </DialogDescription>
            </DialogHeader>
          </div>

          {/* Scrollable Body - Native scroll for cross-platform reliability */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] px-6">
            <div className="space-y-4 py-4">
              {/* Row 1: Vendor and Date */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Vendor *</Label>
                  <Select
                    value={form.vendor_id || ""}
                    onValueChange={(value) => setForm({ ...form, vendor_id: value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors.length === 0 ? (
                        <div className="py-2 px-3 text-sm text-muted-foreground">
                          No vendors available
                        </div>
                      ) : (
                        vendors.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.name} {v.phone && `(${v.phone})`}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Date *</Label>
                  <Input
                    type="date"
                    value={form.procurement_date}
                    onChange={(e) => setForm({ ...form, procurement_date: e.target.value })}
                  />
                </div>
              </div>

              {/* Row 2: Session and Quantity */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Session *</Label>
                  <Select
                    value={form.session}
                    onValueChange={(value) => setForm({ ...form, session: value as "morning" | "evening" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="morning">Morning</SelectItem>
                      <SelectItem value="evening">Evening</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
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
              </div>

              {/* Row 3: Fat % and SNF % */}
              <div className="grid gap-4 sm:grid-cols-2">
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
              </div>

              {/* Row 4: Rate and Payment Status (read-only when editing) */}
              <div className="grid gap-4 sm:grid-cols-2">
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
                  <Label>Payment Status</Label>
                  {editingId ? (
                    <div>
                      <Input
                        value={form.payment_status.charAt(0).toUpperCase() + form.payment_status.slice(1)}
                        disabled
                        className="bg-muted cursor-not-allowed"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        Use the ₹ button to record payments
                      </p>
                    </div>
                  ) : (
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
                  )}
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

              {/* Row 5: Notes (full width) */}
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
          </div>

          {/* Fixed Footer - Always visible */}
          <div className="px-6 py-4 border-t bg-background shrink-0">
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingId ? "Update" : "Save Procurement"}
              </Button>
            </div>
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
