
# Milk Procurement Expense Integration Plan

## Overview
Integrate the milk procurement system with the expenses module so that expense entries are **only created when payments are made to vendors**, not on a daily procurement entry basis. This follows the same pattern used for salary payments (expense logged when payroll is marked paid, not when hours are recorded).

## Current State Analysis
- **MilkProcurement Component**: Has a `handleRecordPayment()` function (line 263-295) that updates payment status
- **useExpenseAutomation Hook**: Provides methods like `logSalaryExpense`, `logFeedPurchase` with duplicate detection via `[AUTO]` prefix pattern matching
- **ExpenseAutomationCard**: Categorizes auto-expenses by pattern matching notes like `payroll:`, `feed_purchase:`, etc.
- **Expenses Page**: Shows auto-tracked expenses with "Auto" badge when notes start with `[AUTO]`

## Integration Approach

### 1. Add New Method to `useExpenseAutomation`
Create a `logMilkProcurementPayment()` function that:
- Takes supplier name, payment amount, payment date, and procurement ID
- Uses reference type `milk_procurement` for duplicate detection
- Categorizes as "feed" (milk procurement is a raw material cost)
- Includes supplier name and payment details in notes

### 2. Integrate into Payment Recording
Modify `handleRecordPayment()` in MilkProcurement component to:
- Call the expense automation hook after successful payment
- Pass the actual payment amount (not total invoice amount)
- Use procurement ID as reference to prevent duplicate expenses

### 3. Update ExpenseAutomationCard
Add milk procurement detection pattern to include in dashboard analytics.

## Technical Details

### File 1: `src/hooks/useExpenseAutomation.ts`

**Add new method after `logFeedPurchase()` (around line 183):**

```typescript
/**
 * Log milk procurement payment expense
 * Only called when actual payment is made to vendor
 */
const logMilkProcurementPayment = async (
  supplierName: string,
  paymentAmount: number,
  paymentDate: string,
  procurementId: string,
  quantityLiters?: number
): Promise<boolean> => {
  if (paymentAmount <= 0) return false;

  return await createExpense({
    category: "feed",
    title: `Milk Procurement - ${supplierName}`,
    amount: paymentAmount,
    expense_date: paymentDate,
    notes: quantityLiters ? `${quantityLiters}L purchased` : undefined,
    reference_type: "milk_procurement",
    reference_id: procurementId,
  });
};
```

**Update the return statement to include the new method:**

```typescript
return {
  createExpense,
  logSalaryExpense,
  logEquipmentPurchase,
  logMaintenanceExpense,
  logHealthExpense,
  logFeedPurchase,
  logGenericExpense,
  logBottleLoss,
  logTransportExpense,
  logUtilityExpense,
  logMilkProcurementPayment, // NEW
};
```

### File 2: `src/components/production/MilkProcurement.tsx`

**Add import for expense automation hook (after other imports):**

```typescript
import { useExpenseAutomation } from "@/hooks/useExpenseAutomation";
import { useQueryClient } from "@tanstack/react-query";
```

**Initialize hooks inside component (after existing hooks):**

```typescript
const { logMilkProcurementPayment } = useExpenseAutomation();
const queryClient = useQueryClient();
```

**Modify `handleRecordPayment()` to log expense after successful payment (around line 285-294):**

```typescript
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
    // Log expense for this payment
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
```

### File 3: `src/components/dashboard/ExpenseAutomationCard.tsx`

**Add milk procurement detection to the categorization (around line 48-51):**

```typescript
// Categorize auto expenses
const salaryExpenses = expenses.filter(e => e.notes?.includes("payroll:"));
const feedExpenses = expenses.filter(e => 
  e.notes?.includes("feed_purchase:") || 
  e.notes?.includes("feed_") ||
  e.notes?.includes("milk_procurement:") // NEW: Include milk procurement
);
const equipmentExpenses = expenses.filter(e => e.notes?.includes("equipment:"));
const maintenanceExpenses = expenses.filter(e => e.notes?.includes("maintenance:"));
const healthExpenses = expenses.filter(e => e.notes?.includes("health:"));
```

**Optionally, add a separate "Milk Procurement" category for more granular tracking:**

```typescript
const milkProcurementExpenses = expenses.filter(e => e.notes?.includes("milk_procurement:"));
```

And add to categories array:

```typescript
{
  category: "milk_procurement",
  label: "Milk Procurement",
  icon: Truck,
  color: "text-amber-600",
  bgColor: "bg-amber-500/10",
  total: milkProcurementExpenses.reduce((sum, e) => sum + Number(e.amount), 0),
  count: milkProcurementExpenses.length,
},
```

## Flow Diagram

```text
┌─────────────────────────────────────────────────────────────────────┐
│                  Daily Milk Procurement Entry                       │
│            (Supplier, Quantity, Rate - NO expense logged)           │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Payment Status: "pending"                        │
│                (Accumulates until vendor is paid)                   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│              User Clicks "Pay" Button (₹ icon)                      │
│                  Opens Payment Dialog                               │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│              User Enters Payment Amount                             │
│         (Can be partial or full payment)                            │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│           handleRecordPayment() executes                            │
│   1. Updates milk_procurement table                                 │
│   2. Calls logMilkProcurementPayment() → EXPENSE CREATED            │
│   3. Invalidates expense caches                                     │
│   4. Shows success toast                                            │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│               Expense Entry Created:                                │
│   Category: "feed"                                                  │
│   Title: "Milk Procurement - [Supplier Name]"                       │
│   Amount: [Actual Payment Amount]                                   │
│   Notes: "[AUTO] milk_procurement:[ID] | [X]L purchased"            │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Integration Points

| When | Action | Expense Created? |
|------|--------|------------------|
| Daily procurement entry | Record quantity, rate, supplier | No |
| Edit procurement record | Update details | No |
| Record partial payment | Pay ₹X towards pending amount | Yes (₹X) |
| Record full payment | Complete payment | Yes (payment amount) |
| Delete procurement | Remove record | No |

## Duplicate Prevention
- Uses `checkExpenseExists()` with pattern `[AUTO] milk_procurement:[procurement_id]%`
- Same procurement ID cannot generate duplicate expenses
- Multiple partial payments allowed (each creates separate expense with unique reference)

## Smart Handling for Partial Payments
Since vendors may receive multiple partial payments:
- Each payment creates a separate expense entry
- Reference ID format: `[procurement_id]_[timestamp]` for multiple payments
- All payments are tagged with the supplier name for easy filtering

## Summary of Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `src/hooks/useExpenseAutomation.ts` | Modify | Add `logMilkProcurementPayment()` method |
| `src/components/production/MilkProcurement.tsx` | Modify | Integrate expense logging into payment flow |
| `src/components/dashboard/ExpenseAutomationCard.tsx` | Modify | Add milk procurement to analytics |
