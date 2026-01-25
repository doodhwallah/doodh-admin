
# Simplify Record Milk Procurement Popup

## Current State
The current "Record Milk Procurement" dialog has:
- Date field
- Vendor dropdown (optional) 
- Supplier Name field (manual entry)
- Supplier Phone field
- Supplier Address field
- Quantity, Rate, Vehicle Number
- Fat %, SNF %, Quality Grade
- Payment Status, Paid Amount, Payment Mode
- Notes

## Requested Changes
Based on the reference image, simplify the form to:
1. Make **Vendor dropdown required** (no manual entry option)
2. **Remove** Supplier Name, Phone, and Address fields (these will come from the selected vendor)
3. Reorganize layout to match reference image

## New Form Layout (Matching Reference)

| Row | Left Field | Right Field |
|-----|------------|-------------|
| 1 | Vendor * (dropdown) | Date * |
| 2 | Session * (Morning/Evening dropdown) | Quantity (Liters) * |
| 3 | Fat % | SNF % |
| 4 | Rate per Liter (₹) | Payment Status |
| 5 | Notes (full width) | - |
| 6 | Cancel button | Save Record button |

## Implementation Steps

### Step 1: Update the Form State
- Remove `supplier_name`, `supplier_phone`, `supplier_address` from `emptyForm`
- Add `session` field ("morning" or "evening") to `emptyForm`
- Change `vendor_id` to be required (non-empty validation)

### Step 2: Update the Validation
- Modify `handleSave()` to require `vendor_id` instead of `supplier_name`
- Get supplier name from the selected vendor for the database record

### Step 3: Redesign the Dialog Form
- Row 1: Vendor dropdown (required) + Date picker
- Row 2: Session dropdown + Quantity input
- Row 3: Fat % + SNF % inputs
- Row 4: Rate per Liter + Payment Status dropdown
- Row 5: Notes textarea (full width)
- Remove: Supplier Name, Phone, Address, Vehicle Number, Quality Grade, Paid Amount, Payment Mode fields from the initial entry form

### Step 4: Update the Save Logic
- When saving, populate `supplier_name` from the selected vendor
- Optionally populate `supplier_phone` and `supplier_address` from vendor data

## Files to Modify

| File | Changes |
|------|---------|
| `src/components/production/MilkProcurement.tsx` | Redesign dialog form, update validation, add session field |

## Technical Details

The vendor dropdown will be changed from:
```tsx
<Label>Select Vendor (Optional)</Label>
// with "manual" option
```

To:
```tsx
<Label>Vendor *</Label>
// Required, no manual option
```

The session dropdown will be added:
```tsx
<Select value={form.session} onValueChange={(v) => setForm({...form, session: v})}>
  <SelectItem value="morning">Morning</SelectItem>
  <SelectItem value="evening">Evening</SelectItem>
</Select>
```

Removed fields:
- `supplier_name` input (auto-filled from vendor)
- `supplier_phone` input
- `supplier_address` input
- `vehicle_number` input
- `quality_grade` dropdown
- `paid_amount` input (payment handled separately)
- `payment_mode` dropdown (payment handled separately)

## Expected Outcome
A cleaner, simpler procurement form that:
- Requires selecting a registered vendor
- Matches the reference image layout
- Includes session (Morning/Evening) selection
- Focuses on essential entry fields only
- Payment details handled via separate payment dialog (already exists)
