import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { DataTable } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { VendorDetailDialog } from "./VendorDetailDialog";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { 
  Users, 
  Plus, 
  Pencil, 
  Trash2, 
  Phone, 
  Eye,
  IndianRupee,
  Loader2
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  // Aggregated fields
  total_procurement?: number;
  pending_balance?: number;
}

const emptyForm = {
  name: "",
  phone: "",
  address: "",
  bank_name: "",
  account_number: "",
  ifsc_code: "",
  upi_id: "",
  notes: "",
  is_active: true,
};

export function VendorManagement() {
  const [vendors, setVendors] = useState<MilkVendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedVendor, setSelectedVendor] = useState<MilkVendor | null>(null);
  const [form, setForm] = useState(emptyForm);
  const { toast } = useToast();

  const fetchVendors = useCallback(async () => {
    setLoading(true);
    
    // Fetch vendors
    const { data: vendorData, error: vendorError } = await supabase
      .from("milk_vendors")
      .select("*")
      .order("name");

    if (vendorError) {
      toast({
        title: "Error fetching vendors",
        description: vendorError.message,
        variant: "destructive",
      });
      setLoading(false);
      return;
    }

    // Fetch procurement summaries for each vendor
    const { data: procurementData } = await supabase
      .from("milk_procurement")
      .select("vendor_id, total_amount, paid_amount");

    const vendorStats: Record<string, { total: number; pending: number }> = {};
    
    (procurementData || []).forEach(p => {
      if (p.vendor_id) {
        if (!vendorStats[p.vendor_id]) {
          vendorStats[p.vendor_id] = { total: 0, pending: 0 };
        }
        vendorStats[p.vendor_id].total += Number(p.total_amount);
        vendorStats[p.vendor_id].pending += Number(p.total_amount) - Number(p.paid_amount || 0);
      }
    });

    const vendorsWithStats = (vendorData || []).map(v => ({
      ...v,
      total_procurement: vendorStats[v.id]?.total || 0,
      pending_balance: vendorStats[v.id]?.pending || 0,
    }));

    setVendors(vendorsWithStats);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    fetchVendors();
  }, [fetchVendors]);

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Vendor name is required",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);

    const record = {
      name: form.name.trim(),
      phone: form.phone || null,
      address: form.address || null,
      bank_name: form.bank_name || null,
      account_number: form.account_number || null,
      ifsc_code: form.ifsc_code || null,
      upi_id: form.upi_id || null,
      notes: form.notes || null,
      is_active: form.is_active,
    };

    let error;
    if (editingId) {
      const { error: updateError } = await supabase
        .from("milk_vendors")
        .update(record)
        .eq("id", editingId);
      error = updateError;
    } else {
      const { error: insertError } = await supabase
        .from("milk_vendors")
        .insert(record);
      error = insertError;
    }

    setSaving(false);

    if (error) {
      toast({
        title: "Error saving vendor",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: editingId ? "Vendor updated" : "Vendor added",
        description: `${form.name} has been ${editingId ? 'updated' : 'added'}`,
      });
      setDialogOpen(false);
      resetForm();
      fetchVendors();
    }
  };

  const handleEdit = (vendor: MilkVendor) => {
    setEditingId(vendor.id);
    setForm({
      name: vendor.name,
      phone: vendor.phone || "",
      address: vendor.address || "",
      bank_name: vendor.bank_name || "",
      account_number: vendor.account_number || "",
      ifsc_code: vendor.ifsc_code || "",
      upi_id: vendor.upi_id || "",
      notes: vendor.notes || "",
      is_active: vendor.is_active,
    });
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!selectedVendor) return;

    const { error } = await supabase
      .from("milk_vendors")
      .delete()
      .eq("id", selectedVendor.id);

    if (error) {
      toast({
        title: "Error deleting vendor",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Vendor deleted",
        description: `${selectedVendor.name} has been removed`,
      });
      fetchVendors();
    }
    setDeleteDialogOpen(false);
    setSelectedVendor(null);
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const columns = [
    {
      key: "name",
      header: "Vendor",
      render: (item: MilkVendor) => (
        <div>
          <div className="font-medium">{item.name}</div>
          {item.phone && (
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Phone className="h-3 w-3" /> {item.phone}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "total_procurement",
      header: "Total Business",
      render: (item: MilkVendor) => (
        <span className="font-medium">₹{(item.total_procurement || 0).toLocaleString()}</span>
      ),
    },
    {
      key: "pending_balance",
      header: "Pending",
      render: (item: MilkVendor) => (
        <span className={`font-medium ${(item.pending_balance || 0) > 0 ? 'text-warning' : 'text-success'}`}>
          ₹{(item.pending_balance || 0).toLocaleString()}
        </span>
      ),
    },
    {
      key: "is_active",
      header: "Status",
      render: (item: MilkVendor) => (
        <StatusBadge 
          status={item.is_active ? "Active" : "Inactive"} 
          variant={item.is_active ? "success" : "default"} 
        />
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (item: MilkVendor) => (
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedVendor(item);
              setDetailDialogOpen(true);
            }}
          >
            <Eye className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleEdit(item)}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelectedVendor(item);
              setDeleteDialogOpen(true);
            }}
          >
            <Trash2 className="h-3 w-3 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  // Calculate totals
  const totalPending = vendors.reduce((sum, v) => sum + (v.pending_balance || 0), 0);
  const totalBusiness = vendors.reduce((sum, v) => sum + (v.total_procurement || 0), 0);
  const activeVendors = vendors.filter(v => v.is_active).length;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Vendors</p>
                <p className="text-2xl font-bold text-primary">{activeVendors}</p>
                <p className="text-xs text-muted-foreground">{vendors.length} total</p>
              </div>
              <Users className="h-8 w-8 text-primary/50" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-info/10 to-info/5 border-info/20">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Business</p>
                <p className="text-2xl font-bold text-info">₹{totalBusiness.toLocaleString()}</p>
              </div>
              <IndianRupee className="h-8 w-8 text-info/50" />
            </div>
          </CardContent>
        </Card>
        <Card className={`bg-gradient-to-br ${totalPending > 0 ? 'from-warning/10 to-warning/5 border-warning/20' : 'from-success/10 to-success/5 border-success/20'}`}>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Pending</p>
                <p className={`text-2xl font-bold ${totalPending > 0 ? 'text-warning' : 'text-success'}`}>
                  ₹{totalPending.toLocaleString()}
                </p>
              </div>
              <IndianRupee className="h-8 w-8 text-warning/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Vendors Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Milk Vendors
          </CardTitle>
          <Button onClick={() => { resetForm(); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Add Vendor
          </Button>
        </CardHeader>
        <CardContent>
          <DataTable
            data={vendors}
            columns={columns}
            searchable
            loading={loading}
            emptyMessage="No vendors found. Add your first vendor!"
          />
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-lg max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Vendor" : "Add New Vendor"}</DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="space-y-4 py-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label>Vendor Name *</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Enter vendor name"
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="Phone number"
                  />
                </div>
                <div>
                  <Label>UPI ID</Label>
                  <Input
                    value={form.upi_id}
                    onChange={(e) => setForm({ ...form, upi_id: e.target.value })}
                    placeholder="vendor@upi"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Address</Label>
                  <Textarea
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    placeholder="Full address"
                    rows={2}
                  />
                </div>
              </div>
              
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-muted-foreground mb-3">Bank Details (Optional)</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Bank Name</Label>
                    <Input
                      value={form.bank_name}
                      onChange={(e) => setForm({ ...form, bank_name: e.target.value })}
                      placeholder="Bank name"
                    />
                  </div>
                  <div>
                    <Label>Account Number</Label>
                    <Input
                      value={form.account_number}
                      onChange={(e) => setForm({ ...form, account_number: e.target.value })}
                      placeholder="Account number"
                    />
                  </div>
                  <div>
                    <Label>IFSC Code</Label>
                    <Input
                      value={form.ifsc_code}
                      onChange={(e) => setForm({ ...form, ifsc_code: e.target.value })}
                      placeholder="IFSC code"
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Additional notes..."
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
              {editingId ? "Update" : "Add"} Vendor
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Vendor Detail Dialog */}
      <VendorDetailDialog
        vendor={selectedVendor}
        open={detailDialogOpen}
        onOpenChange={setDetailDialogOpen}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Delete Vendor"
        description={`Are you sure you want to delete ${selectedVendor?.name}? This action cannot be undone.`}
        onConfirm={handleDelete}
        variant="destructive"
      />
    </div>
  );
}
