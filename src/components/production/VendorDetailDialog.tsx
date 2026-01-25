import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useExpenseAutomation } from "@/hooks/useExpenseAutomation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { 
  Truck, 
  Phone, 
  MapPin, 
  Building2, 
  CreditCard,
  IndianRupee,
  TrendingUp,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Wallet
} from "lucide-react";

interface MilkVendor {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  bank_name: string | null;
  account_number: string | null;
  ifsc_code: string | null;
  upi_id: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

interface ProcurementRecord {
  id: string;
  procurement_date: string;
  quantity_liters: number;
  rate_per_liter: number;
  total_amount: number;
  paid_amount: number | null;
  payment_status: string;
  payment_date: string | null;
  payment_mode: string | null;
}

interface VendorStats {
  totalProcurements: number;
  totalQuantity: number;
  totalAmount: number;
  totalPaid: number;
  pendingBalance: number;
  avgRate: number;
}

interface VendorDetailDialogProps {
  vendor: MilkVendor | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDataChanged?: () => void;
}

export function VendorDetailDialog({ vendor, open, onOpenChange, onDataChanged }: VendorDetailDialogProps) {
  const [loading, setLoading] = useState(true);
  const [procurements, setProcurements] = useState<ProcurementRecord[]>([]);
  const [stats, setStats] = useState<VendorStats>({
    totalProcurements: 0,
    totalQuantity: 0,
    totalAmount: 0,
    totalPaid: 0,
    pendingBalance: 0,
    avgRate: 0,
  });
  const [bulkPaymentOpen, setBulkPaymentOpen] = useState(false);
  const [bulkPaymentAmount, setBulkPaymentAmount] = useState("");
  const [paymentMode, setPaymentMode] = useState("cash");
  const [processingPayment, setProcessingPayment] = useState(false);
  const [payingItemId, setPayingItemId] = useState<string | null>(null);

  const { toast } = useToast();
  const { logMilkProcurementPayment } = useExpenseAutomation();
  const queryClient = useQueryClient();

  const fetchVendorData = useCallback(async () => {
    if (!vendor) return;
    
    setLoading(true);
    
    const { data, error } = await supabase
      .from("milk_procurement")
      .select("id, procurement_date, quantity_liters, rate_per_liter, total_amount, paid_amount, payment_status, payment_date, payment_mode")
      .eq("vendor_id", vendor.id)
      .order("procurement_date", { ascending: false })
      .limit(100);
    
    if (!error && data) {
      setProcurements(data);
      
      const totalProcurements = data.length;
      const totalQuantity = data.reduce((sum, p) => sum + Number(p.quantity_liters), 0);
      const totalAmount = data.reduce((sum, p) => sum + Number(p.total_amount), 0);
      const totalPaid = data.reduce((sum, p) => sum + Number(p.paid_amount || 0), 0);
      const pendingBalance = totalAmount - totalPaid;
      const avgRate = totalQuantity > 0 ? totalAmount / totalQuantity : 0;
      
      setStats({
        totalProcurements,
        totalQuantity,
        totalAmount,
        totalPaid,
        pendingBalance,
        avgRate,
      });
    }
    
    setLoading(false);
  }, [vendor]);

  useEffect(() => {
    if (open && vendor) {
      fetchVendorData();
    }
  }, [open, vendor, fetchVendorData]);

  const handleQuickPay = async (proc: ProcurementRecord) => {
    if (!vendor) return;
    
    setPayingItemId(proc.id);
    const pending = Number(proc.total_amount) - Number(proc.paid_amount || 0);
    
    const { error } = await supabase
      .from("milk_procurement")
      .update({
        paid_amount: Number(proc.total_amount),
        payment_status: "paid",
        payment_date: format(new Date(), "yyyy-MM-dd"),
        payment_mode: "cash",
      })
      .eq("id", proc.id);

    if (error) {
      toast({ title: "Error recording payment", description: error.message, variant: "destructive" });
    } else {
      await logMilkProcurementPayment(vendor.name, pending, format(new Date(), "yyyy-MM-dd"), proc.id, proc.quantity_liters);
      
      queryClient.invalidateQueries({ queryKey: ["expenses"] });
      queryClient.invalidateQueries({ queryKey: ["auto-expense-stats"] });
      queryClient.invalidateQueries({ queryKey: ["vendors"] });
      
      toast({ title: "Payment recorded", description: `₹${pending.toLocaleString()} paid` });
      fetchVendorData();
      onDataChanged?.();
    }
    setPayingItemId(null);
  };

  const handleBulkPayment = async () => {
    if (!vendor || !bulkPaymentAmount) return;
    
    setProcessingPayment(true);
    const amount = parseFloat(bulkPaymentAmount);
    let remaining = amount;
    let totalPaid = 0;
    let entriesPaid = 0;
    
    const pendingProcurements = procurements
      .filter(p => p.payment_status !== "paid")
      .sort((a, b) => new Date(a.procurement_date).getTime() - new Date(b.procurement_date).getTime());
    
    for (const proc of pendingProcurements) {
      if (remaining <= 0) break;
      
      const pending = Number(proc.total_amount) - Number(proc.paid_amount || 0);
      const toPay = Math.min(remaining, pending);
      
      const newPaid = Number(proc.paid_amount || 0) + toPay;
      const newStatus = newPaid >= Number(proc.total_amount) ? "paid" : "partial";
      
      const { error } = await supabase
        .from("milk_procurement")
        .update({ 
          paid_amount: newPaid, 
          payment_status: newStatus, 
          payment_date: format(new Date(), "yyyy-MM-dd"),
          payment_mode: paymentMode,
        })
        .eq("id", proc.id);
      
      if (!error) {
        await logMilkProcurementPayment(vendor.name, toPay, format(new Date(), "yyyy-MM-dd"), proc.id, proc.quantity_liters);
        totalPaid += toPay;
        entriesPaid++;
      }
      
      remaining -= toPay;
    }
    
    queryClient.invalidateQueries({ queryKey: ["expenses"] });
    queryClient.invalidateQueries({ queryKey: ["auto-expense-stats"] });
    queryClient.invalidateQueries({ queryKey: ["vendors"] });
    
    toast({
      title: "Bulk payment recorded",
      description: `₹${totalPaid.toLocaleString()} paid across ${entriesPaid} entries`,
    });
    
    setBulkPaymentOpen(false);
    setBulkPaymentAmount("");
    setProcessingPayment(false);
    fetchVendorData();
    onDataChanged?.();
  };

  if (!vendor) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              {vendor.name}
              <Badge variant={vendor.is_active ? "default" : "secondary"}>
                {vendor.is_active ? "Active" : "Inactive"}
              </Badge>
            </DialogTitle>
            {stats.pendingBalance > 0 && (
              <Button onClick={() => setBulkPaymentOpen(true)} size="sm" className="ml-4">
                <Wallet className="h-4 w-4 mr-2" />
                Pay Pending (₹{stats.pendingBalance.toLocaleString()})
              </Button>
            )}
          </div>
        </DialogHeader>
        
        <ScrollArea className="flex-1 pr-4">
          <div className="space-y-6">
            {/* Contact & Bank Info */}
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Contact Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {vendor.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      {vendor.phone}
                    </div>
                  )}
                  {vendor.address && (
                    <div className="flex items-start gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                      {vendor.address}
                    </div>
                  )}
                  {!vendor.phone && !vendor.address && (
                    <p className="text-sm text-muted-foreground">No contact info</p>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    Payment Details
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {vendor.bank_name && (
                    <div className="flex items-center gap-2 text-sm">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      {vendor.bank_name}
                    </div>
                  )}
                  {vendor.account_number && (
                    <div className="flex items-center gap-2 text-sm">
                      <CreditCard className="h-4 w-4 text-muted-foreground" />
                      A/C: {vendor.account_number}
                      {vendor.ifsc_code && <span className="text-muted-foreground">| IFSC: {vendor.ifsc_code}</span>}
                    </div>
                  )}
                  {vendor.upi_id && (
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">UPI:</span> {vendor.upi_id}
                    </div>
                  )}
                  {!vendor.bank_name && !vendor.upi_id && (
                    <p className="text-sm text-muted-foreground">No payment info</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Stats Cards */}
            {loading ? (
              <div className="grid gap-4 sm:grid-cols-4">
                {[1, 2, 3, 4].map(i => (
                  <Skeleton key={i} className="h-24" />
                ))}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-4">
                <Card className="bg-gradient-to-br from-info/10 to-info/5 border-info/20">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Total Quantity</p>
                        <p className="text-xl font-bold text-info">{stats.totalQuantity.toLocaleString()} L</p>
                        <p className="text-xs text-muted-foreground">{stats.totalProcurements} entries</p>
                      </div>
                      <TrendingUp className="h-8 w-8 text-info/50" />
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Total Amount</p>
                        <p className="text-xl font-bold text-primary">₹{stats.totalAmount.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">Avg: ₹{stats.avgRate.toFixed(2)}/L</p>
                      </div>
                      <IndianRupee className="h-8 w-8 text-primary/50" />
                    </div>
                  </CardContent>
                </Card>
                
                <Card className="bg-gradient-to-br from-success/10 to-success/5 border-success/20">
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Total Paid</p>
                        <p className="text-xl font-bold text-success">₹{stats.totalPaid.toLocaleString()}</p>
                      </div>
                      <CheckCircle2 className="h-8 w-8 text-success/50" />
                    </div>
                  </CardContent>
                </Card>
                
                <Card className={`bg-gradient-to-br ${stats.pendingBalance > 0 ? 'from-warning/10 to-warning/5 border-warning/20' : 'from-muted/10 to-muted/5'}`}>
                  <CardContent className="pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-medium text-muted-foreground">Pending Balance</p>
                        <p className={`text-xl font-bold ${stats.pendingBalance > 0 ? 'text-warning' : 'text-muted-foreground'}`}>
                          ₹{stats.pendingBalance.toLocaleString()}
                        </p>
                      </div>
                      {stats.pendingBalance > 0 ? (
                        <AlertTriangle className="h-8 w-8 text-warning/50" />
                      ) : (
                        <CheckCircle2 className="h-8 w-8 text-muted-foreground/50" />
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Payment History */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  Procurement & Payment History
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                      <Skeleton key={i} className="h-16" />
                    ))}
                  </div>
                ) : procurements.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No procurement records found for this vendor
                  </p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {procurements.map((p) => {
                      const pending = Number(p.total_amount) - Number(p.paid_amount || 0);
                      return (
                        <div
                          key={p.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50"
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">
                                {format(new Date(p.procurement_date), "dd MMM yyyy")}
                              </span>
                              <Badge
                                variant={
                                  p.payment_status === "paid"
                                    ? "default"
                                    : p.payment_status === "partial"
                                    ? "secondary"
                                    : "destructive"
                                }
                                className="text-xs"
                              >
                                {p.payment_status}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {p.quantity_liters}L @ ₹{p.rate_per_liter}/L
                              {p.payment_date && (
                                <span className="ml-2">
                                  • Paid on {format(new Date(p.payment_date), "dd MMM")}
                                  {p.payment_mode && ` via ${p.payment_mode}`}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="font-semibold">₹{Number(p.total_amount).toLocaleString()}</p>
                              {pending > 0 && (
                                <p className="text-xs text-warning">
                                  Pending: ₹{pending.toLocaleString()}
                                </p>
                              )}
                            </div>
                            {p.payment_status !== "paid" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleQuickPay(p)}
                                disabled={payingItemId === p.id}
                              >
                                {payingItemId === p.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <>
                                    <IndianRupee className="h-3 w-3 mr-1" />
                                    Pay
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {vendor.notes && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{vendor.notes}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </ScrollArea>

        {/* Bulk Payment Dialog */}
        <Dialog open={bulkPaymentOpen} onOpenChange={setBulkPaymentOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Record Bulk Payment</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <p className="text-sm text-muted-foreground mb-2">
                  Pending balance: <span className="font-semibold text-warning">₹{stats.pendingBalance.toLocaleString()}</span>
                </p>
                <Label>Payment Amount (₹)</Label>
                <Input
                  type="number"
                  value={bulkPaymentAmount}
                  onChange={(e) => setBulkPaymentAmount(e.target.value)}
                  placeholder="Enter amount"
                  max={stats.pendingBalance}
                />
              </div>
              <div>
                <Label>Payment Mode</Label>
                <Select value={paymentMode} onValueChange={setPaymentMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="upi">UPI</SelectItem>
                    <SelectItem value="bank">Bank Transfer</SelectItem>
                    <SelectItem value="cheque">Cheque</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-muted-foreground">
                Payment will be applied to oldest pending entries first.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBulkPaymentOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleBulkPayment} 
                disabled={!bulkPaymentAmount || processingPayment}
              >
                {processingPayment && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Record Payment
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
