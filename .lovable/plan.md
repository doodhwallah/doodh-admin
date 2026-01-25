
# Addon Delivery Feature Implementation Plan

## Overview
Replace the "New Delivery" quick action on the Dashboard with an "Addon Delivery" feature that allows staff to quickly record extra/addon products requested by customers outside their regular subscription. This feature will be fully integrated with the delivery system, billing, and ledger automation.

## What is Addon Delivery?
When a customer requests extra products beyond their regular daily subscription (e.g., "I need 2 extra liters of milk today" or "Add 1 kg paneer to today's delivery"), staff can use this quick action to:
1. Select the customer
2. Choose products and quantities
3. Immediately record it as a delivered item
4. Have it automatically reflect in billing and ledger

## Current System Understanding
- Regular deliveries are auto-scheduled based on `customer_products` (subscriptions)
- `delivery_items` table links products to deliveries with quantity and pricing
- Invoices aggregate `delivery_items` for billing periods
- Customer ledger tracks all debits (deliveries) and credits (payments)

## Implementation Plan

### 1. Create AddonDeliveryDialog Component
**New File:** `src/components/deliveries/AddonDeliveryDialog.tsx`

This dialog will:
- Allow customer selection (searchable dropdown)
- Show the customer's current balance for quick reference
- Allow adding multiple products with quantities
- Auto-populate pricing from product base_price or customer's custom_price
- Create both the delivery and delivery_items in a single transaction
- Optionally mark as delivered immediately

**Form Fields:**
- Customer (required, searchable)
- Delivery Date (defaults to today)
- Products (multi-row):
  - Product dropdown
  - Quantity input
  - Unit price (auto-filled, editable)
- Notes (optional, for context like "Customer called at 2pm")
- "Mark as Delivered" checkbox (default: checked)

### 2. Update QuickActionsCard
**File:** `src/components/dashboard/QuickActionsCard.tsx`

Changes:
- Replace "New Delivery" with "Addon Delivery"
- Change icon from `Truck` to `PackagePlus` (more appropriate for addon)
- Change href to `/deliveries?action=addon`
- Update color scheme to distinguish from regular delivery

### 3. Update QuickActionFab (Mobile)
**File:** `src/components/mobile/QuickActionFab.tsx`

Changes:
- Replace "New Delivery" with "Addon Delivery"
- Update href to `/deliveries?action=addon`

### 4. Update Deliveries Page
**File:** `src/pages/Deliveries.tsx`

Changes:
- Add state for addon dialog: `addonDialogOpen`
- Handle URL param `?action=addon` to open addon dialog
- Import and render `AddonDeliveryDialog` component
- Keep existing "Add Delivery" for scheduling future deliveries

### 5. Integration Points

#### 5.1 Delivery Items Creation
When addon is saved:
```typescript
// 1. Create delivery record
const { data: delivery } = await supabase.from("deliveries").insert({
  customer_id,
  delivery_date,
  status: "delivered", // Mark as delivered immediately
  delivery_time: new Date().toISOString(),
  notes: `[ADDON] ${notes}`,
}).select().single();

// 2. Create delivery items
const deliveryItems = selectedProducts.map(p => ({
  delivery_id: delivery.id,
  product_id: p.product_id,
  quantity: p.quantity,
  unit_price: p.unit_price,
  total_amount: p.quantity * p.unit_price,
}));
await supabase.from("delivery_items").insert(deliveryItems);
```

#### 5.2 Ledger Automation (Existing Hook)
The existing `useLedgerAutomation` hook already handles ledger entries for deliveries. When a delivery with items is marked as "delivered", it creates the appropriate debit entry in `customer_ledger`.

#### 5.3 Billing Integration
No changes needed - the existing billing system already aggregates all `delivery_items` for a billing period, so addon deliveries will automatically be included in invoices.

### 6. Visual Identification of Addon Deliveries
In the Deliveries list and other views:
- Addon deliveries will have `[ADDON]` prefix in notes
- Add a badge "Addon" to distinguish from regular subscription deliveries

---

## Technical Details

### AddonDeliveryDialog Component Structure

```typescript
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
```

### Database Flow

```text
User Action: "Add Addon Delivery"
         |
         v
+-------------------+
| AddonDeliveryDialog|
| - Select Customer |
| - Add Products    |
| - Set Quantities  |
+-------------------+
         |
         v
+-------------------+     +-------------------+
| deliveries table  |---->| delivery_items    |
| (status=delivered)|     | (product details) |
+-------------------+     +-------------------+
         |                         |
         v                         v
+-------------------+     +-------------------+
| customer_ledger   |     | invoices (later)  |
| (debit entry)     |     | (auto-included)   |
+-------------------+     +-------------------+
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/deliveries/AddonDeliveryDialog.tsx` | Main addon delivery form dialog |

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/dashboard/QuickActionsCard.tsx` | Replace "New Delivery" with "Addon Delivery" |
| `src/components/mobile/QuickActionFab.tsx` | Replace "New Delivery" with "Addon Delivery" |
| `src/pages/Deliveries.tsx` | Handle `?action=addon` param, render AddonDeliveryDialog |

---

## User Experience Flow

1. **Staff sees customer request for extra products**
2. **Opens Dashboard → Quick Actions → Addon Delivery**
3. **Selects customer** (sees their current balance)
4. **Adds products and quantities** (prices auto-filled)
5. **Clicks "Add Addon"** 
6. **System automatically:**
   - Creates delivery record (marked as delivered)
   - Creates delivery_items for each product
   - Updates customer ledger with debit entry
   - Shows success confirmation

7. **At month-end billing:**
   - Addon items appear in invoice automatically
   - No manual reconciliation needed

---

## Differentiation: New Delivery vs Addon Delivery

| Aspect | New Delivery (Existing) | Addon Delivery (New) |
|--------|------------------------|---------------------|
| Purpose | Schedule future deliveries | Record instant extra products |
| Status | Defaults to "pending" | Defaults to "delivered" |
| Products | No items (uses subscription) | Explicit product selection |
| Timing | Can be any date | Typically today |
| Use Case | Planning | Field operations |
| Notes | Optional | Tagged with [ADDON] |

---

## Summary
This implementation creates a streamlined workflow for recording addon/extra product deliveries that customers request on-demand. The feature integrates seamlessly with:
- Delivery tracking (visible in delivery list with ADDON badge)
- Billing system (auto-included in period invoices)
- Customer ledger (immediate debit entry)
- Mobile app (accessible via QuickActionFab)

No existing automations or integrations will be affected - this adds a new entry point that flows through the established data pipeline.
