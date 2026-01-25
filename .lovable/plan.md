
# Edit Invoice Feature Implementation Plan

## Overview
Add an "Edit Invoice" feature to allow administrators/managers to modify existing invoices before they are fully paid. This includes editing quantities, rates, discounts, due dates, and adding/removing line items.

## Current State Analysis
- **Invoice Storage**: Invoices are stored in the `invoices` table with line item details stored in the `notes` field as a formatted string (e.g., `Product: qty unit @ Rs.rate/unit`)
- **Existing Dialog**: The "Create Invoice" dialog already has all the UI components for managing line items (product dropdown, quantity, rate, tax calculations)
- **Payment Flow**: Invoices with `payment_status === "paid"` should not be editable

## Implementation Approach

### 1. State & Dialog Management
- Add new state variables:
  - `editDialogOpen` - Boolean to control edit dialog visibility
  - `editingInvoice` - Stores the invoice being edited
  - `isEditMode` - Flag to differentiate between create and edit modes
- Reuse the existing line items form UI from the create dialog

### 2. Parse Existing Invoice Notes to Line Items
- Create a `parseNotesToLineItems()` function that converts the notes string back into structured `LineItem[]` objects
- Pattern matching: `"Product: qty unit @ Rs.rate/unit"` or `"Product: qty unit @ ₹rate/unit"`
- Match products from the products list to get product IDs

### 3. Edit Button in Actions Column
- Add an "Edit" button next to the "Pay" button in the table
- Only show/enable when `payment_status !== "paid"`
- On click: populate form with invoice data and parsed line items

### 4. Update Invoice Function
- Create `handleUpdateInvoice()` function that:
  - Validates line items (at least one item with quantity > 0)
  - Recalculates totals (subtotal, tax, discount, final amount)
  - Updates the invoice in the database
  - Re-formats line items back to the notes string format
  - Preserves the original invoice number and customer
  - Shows success/error toast

### 5. Edit Dialog UI
- Reuse the ScrollArea form layout from create dialog
- Pre-populate all fields:
  - Customer (readonly - cannot change customer on edit)
  - Billing period dates
  - Line items parsed from notes
  - Discount amount
- Show calculated totals in summary section
- Include "Update Invoice" button

## Technical Details

### File Changes: `src/pages/Billing.tsx`

#### New State Variables (after line 106)
```typescript
const [editDialogOpen, setEditDialogOpen] = useState(false);
const [editingInvoice, setEditingInvoice] = useState<InvoiceWithCustomer | null>(null);
const [isEditMode, setIsEditMode] = useState(false);
```

#### New Function: `parseNotesToLineItems()` (after `autoCalculateFromDeliveries`)
```typescript
const parseNotesToLineItems = (notes: string | null | undefined): LineItem[] => {
  if (!notes) return [];
  const items: LineItem[] = [];
  const noteLines = notes.split("; ");
  
  noteLines.forEach((line) => {
    // Match: "Product: qty unit @ Rs.rate/unit" or "@ ₹rate"
    const match = line.match(/(.+?):\s*([\d.]+)\s*(\w+)\s*@\s*(?:Rs\.?|₹)\s*([\d.]+)/i);
    if (match) {
      const [, productName, qty, unit, rate] = match;
      const product = products.find(p => 
        p.name.toLowerCase() === productName.trim().toLowerCase()
      );
      // Create line item with or without product match
      items.push({
        id: crypto.randomUUID(),
        product_id: product?.id || "",
        product_name: productName.trim(),
        quantity: parseFloat(qty),
        unit: unit,
        rate: parseFloat(rate),
        tax_percentage: product?.tax_percentage || 0,
        amount: parseFloat(qty) * parseFloat(rate),
        source: 'manual'
      });
    }
  });
  return items;
};
```

#### New Function: `handleEditInvoice()` (after `parseNotesToLineItems`)
```typescript
const handleEditInvoice = (invoice: InvoiceWithCustomer) => {
  setEditingInvoice(invoice);
  setCustomerId(invoice.customer_id);
  setPeriodStart(invoice.billing_period_start);
  setPeriodEnd(invoice.billing_period_end);
  setDiscountAmount(Number(invoice.discount_amount) || 0);
  
  // Parse notes to line items
  const parsedItems = parseNotesToLineItems(invoice.notes);
  setLineItems(parsedItems.length > 0 ? parsedItems : []);
  
  setIsEditMode(true);
  setDialogOpen(true);
};
```

#### New Function: `handleUpdateInvoice()` (after `handleCreateInvoice`)
```typescript
const handleUpdateInvoice = async () => {
  if (!editingInvoice) return;
  
  if (lineItems.length === 0 || lineItems.every(item => item.amount === 0)) {
    toast({
      title: "Validation Error",
      description: "Please add at least one line item with quantity and rate",
      variant: "destructive",
    });
    return;
  }

  setSaving(true);
  
  // Format line items for notes
  const itemsDetail = lineItems
    .filter(item => item.product_name && item.quantity > 0)
    .map(item => `${item.product_name}: ${item.quantity} ${item.unit} @ ₹${item.rate}/${item.unit}`)
    .join("; ");

  const { error } = await supabase
    .from("invoices")
    .update({
      billing_period_start: periodStart,
      billing_period_end: periodEnd,
      total_amount: subtotal,
      tax_amount: totalTax,
      discount_amount: discountAmount,
      final_amount: grandTotal,
      notes: itemsDetail || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", editingInvoice.id);

  setSaving(false);

  if (error) {
    toast({
      title: "Error updating invoice",
      description: error.message,
      variant: "destructive",
    });
  } else {
    toast({
      title: "Invoice updated",
      description: "The invoice has been updated successfully",
    });
    setDialogOpen(false);
    resetForm();
    fetchData();
  }
};
```

#### Modified: `resetForm()` Function
```typescript
const resetForm = () => {
  setCustomerId("");
  setPeriodStart(format(new Date(new Date().setDate(1)), "yyyy-MM-dd"));
  setPeriodEnd(format(new Date(), "yyyy-MM-dd"));
  setLineItems([]);
  setDiscountAmount(0);
  setDeliveryCount(0);
  setIsEditMode(false);
  setEditingInvoice(null);
};
```

#### New Import
Add `Pencil` icon from lucide-react

#### Table Actions Column Update
Add Edit button before Pay button:
```typescript
{
  key: "actions",
  header: "Actions",
  render: (item: InvoiceWithCustomer) => (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        className="gap-1"
        onClick={() => handleEditInvoice(item)}
        disabled={item.payment_status === "paid"}
      >
        <Pencil className="h-3 w-3" /> Edit
      </Button>
      <Button
        variant="outline"
        size="sm"
        className="gap-1"
        onClick={() => {
          setSelectedInvoice(item);
          setPaymentAmount("");
          setPaymentDialogOpen(true);
        }}
        disabled={item.payment_status === "paid"}
      >
        <IndianRupee className="h-3 w-3" /> Pay
      </Button>
    </div>
  ),
}
```

#### Dialog Updates
- Change dialog title dynamically: `{isEditMode ? "Edit Invoice" : "Create Invoice"}`
- Change dialog description: `{isEditMode ? "Modify invoice details before payment" : "Auto-calculate from deliveries or add items manually"}`
- Customer dropdown: disabled when `isEditMode` (cannot change customer)
- Hide Auto Calculate button when in edit mode
- Change submit button: `{isEditMode ? "Update Invoice" : "Create Invoice"}`
- Submit handler: `{isEditMode ? handleUpdateInvoice : handleCreateInvoice}`

## User Experience Flow

```text
+------------------+     +-----------------+     +------------------+
|  Invoice Table   | --> |  Click "Edit"   | --> |  Edit Dialog     |
|  (Actions col)   |     |  (if not paid)  |     |  Opens           |
+------------------+     +-----------------+     +------------------+
                                                         |
                                                         v
                                               +------------------+
                                               |  Form populated  |
                                               |  with existing   |
                                               |  invoice data    |
                                               +------------------+
                                                         |
                                                         v
                                               +------------------+
                                               |  User modifies:  |
                                               |  - Quantities    |
                                               |  - Rates         |
                                               |  - Add/Remove    |
                                               |  - Discount      |
                                               +------------------+
                                                         |
                                                         v
                                               +------------------+
                                               |  Click "Update"  |
                                               |  Invoice saved   |
                                               |  Toast shown     |
                                               +------------------+
```

## Edit Restrictions
- Invoices with `payment_status === "paid"` cannot be edited
- Customer cannot be changed on existing invoice
- Invoice number is preserved
- Paid amount is not affected by edits (already recorded payments stay)

## Validation Rules
- At least one line item required
- Line items must have quantity > 0
- Grand total recalculated on every change
- If `paid_amount > final_amount` after edit, show warning (optional enhancement)

## Summary of Changes
| Component | Change Type | Description |
|-----------|-------------|-------------|
| `src/pages/Billing.tsx` | Modify | Add edit mode state, parse function, update handler, Edit button, dynamic dialog |
