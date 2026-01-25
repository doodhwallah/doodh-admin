
## Goal
Make the **Record Milk Procurement** popup work reliably on all platforms by:
1) Fixing the dialog’s **scrolling permanently** (so all fields are reachable and the footer buttons are always accessible).
2) Fixing the **edit/payment data bug** (editing a record must never wipe paid_amount/payment_date/payment_mode or break payment tracking).

---

## What I found (current problems in code)
### A) Scrolling is fragile in the current dialog layout
In `src/components/production/MilkProcurement.tsx`, the dialog uses:
- `DialogContent` as a `flex flex-col` container with `max-h-[90vh]`
- A Radix `ScrollArea` inside: `className="flex-1 max-h-[60vh] pr-4"`
- Footer buttons outside the ScrollArea

This pattern is **missing the key flexbox constraint** needed for nested scrolling to work consistently: `min-h-0` (and an explicit, stable height budget). Without this, many browsers will treat the scroll region as “auto-sized to content” and scrolling won’t engage reliably.

### B) Editing resets payment info (data integrity issue)
`handleSave()` builds a `record` object that always sets:
- `paid_amount: 0`
- `payment_mode: null`
- (and does not preserve `payment_date`)

When editing (`.update(record)`), this **overwrites existing payment fields**, breaking payment totals and “paid/partial” status correctness.

This matches your report: “Popup won’t scroll” + “Edit/payment data issue”.

---

## Implementation approach (permanent fix)
### 1) Rebuild the dialog structure to a proven “fixed header + scroll body + fixed footer” layout
Update the Add/Edit dialog JSX in `MilkProcurement.tsx`:

**New layout**
- `DialogContent`: `flex flex-col` with a stable height constraint and `min-h-0` so children can scroll.
- Header: normal (non-scroll) section.
- Body: a plain `div` with `overflow-y-auto`, `flex-1`, `min-h-0` (native scrolling is most reliable across devices).
- Footer: pinned section (non-scroll), always visible.

**Key classes**
- `DialogContent`: `max-w-2xl w-[calc(100vw-1.5rem)] sm:w-full max-h-[90vh] h-[90vh] sm:h-auto flex flex-col min-h-0 p-0`
  - Use padding on header/body/footer inner containers rather than on the root, so sticky footer styling is clean.
- Body scroll container:
  - `className="flex-1 min-h-0 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]"`

**Why this works**
- `min-h-0` is the core fix that allows the scroll container to actually shrink and create overflow.
- Native `overflow-y-auto` avoids edge cases with Radix ScrollArea sizing in nested flex layouts.
- Footer remains reachable because it is outside the scroll region.

**Clean up**
- Remove the `ScrollArea` import from `MilkProcurement.tsx` since we’ll use native scrolling.

---

### 2) Fix editing so it preserves payment fields and does not corrupt financial history
Refactor `handleSave()` into two distinct payloads:

#### A) Editable fields payload (always safe)
Fields the form is allowed to edit:
- procurement_date
- vendor_id
- supplier_name/phone/address (derived from vendor)
- quantity_liters, fat_percentage, snf_percentage, rate_per_liter, total_amount
- notes (with session prefix)
- payment_status (but see the important rule below)

#### B) Payment fields (must be preserved on edit)
On **insert**, it’s okay to set:
- `paid_amount: 0`, `payment_date: null`, `payment_mode: null`

On **update**, do **not** overwrite these fields unless you are explicitly running the payment flow.

**Recommended rule to avoid bypassing expense logging**
Because your system logs expenses only when payment is recorded (via the payment dialog), we should prevent users from marking a record “paid” inside the edit dialog without recording an actual payment.

So we will implement one of these stable options (I’ll implement the safer one unless you explicitly want otherwise):

**Option 1 (safer, recommended):**
- In Add/Edit dialog:
  - Show “Payment Status” but make it **read-only/disabled**.
  - Add helper text: “Use Record Payment button to update payment.”
- Payment changes happen only via the existing payment dialog, preserving the audit trail.

This prevents mismatched states like: status=paid but paid_amount=0 and no expense record.

(If you want Option 2: allow setting “paid” inside this dialog, we must add “Payment Mode” + auto-set paid_amount=total_amount + log expense automatically. That’s a larger behavioral change.)

---

### 3) Regression-proofing / QA checklist
After changes, verify on Desktop + Mobile:
1. Open `/procurement` → “Add Procurement” → ensure form scrolls with mouse wheel and touch.
2. Save button always visible (footer pinned) even on short screens.
3. Create a record, then record a payment using the ₹ button.
4. Edit that same record and change quantity/rate:
   - paid_amount/payment_mode/payment_date must remain correct
   - payment status must remain consistent
5. Edit dialog should not allow payment manipulation (if implementing Option 1).

---

## Files to change
1) `src/components/production/MilkProcurement.tsx`
- Rebuild dialog layout (native scroll container + fixed footer)
- Remove Radix `ScrollArea` usage/import
- Fix `handleSave()` update payload to preserve payment fields
- (Optional but recommended) Disable payment status editing inside the add/edit dialog with helper text

2) (Optional hardening if you’ve ever seen dropdowns behind overlays)
`src/components/ui/select.tsx`
- Increase `SelectContent` z-index (e.g., from `z-50` to `z-[60]` or `z-[100]`) to ensure dropdowns always render above dialog overlay/content.

---

## Acceptance criteria (what “fixed permanently” means)
- The procurement dialog scrolls reliably on all platforms, every time.
- The footer (Cancel/Save) is always reachable without weird clipping.
- Editing any procurement record never resets/loses payment information.
- Payment tracking remains consistent with the system’s expense logging rules.

---

## Rollout sequence
1) Implement dialog layout changes (scroll + pinned footer).
2) Implement edit/payment preservation changes (safe update payload).
3) Quick UI polish (spacing/padding) and final test on `/procurement`.
