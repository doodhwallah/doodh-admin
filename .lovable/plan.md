
# Separating Milk Production from Milk Procurement

## Overview
Currently, both **Milk Production** (own cattle milk collection) and **Milk Procurement** (external vendor purchases) are combined in a single `/production` page with 4 tabs. This plan separates them into two distinct modules with their own navigation entries, pages, and dedicated functionality.

## Current Structure
```text
/production (single page with 4 tabs)
├── Tab 1: Own Production  → Own cattle milk tracking
├── Tab 2: Procurement     → External vendor purchases
├── Tab 3: Vendors         → Vendor management
└── Tab 4: Analytics       → Procurement analytics
```

## Proposed New Structure
```text
/production (dedicated page with 2 tabs)
├── Tab 1: Daily Collection → Own cattle milk tracking
└── Tab 2: History          → Historical production data

/procurement (NEW dedicated page with 3 tabs)
├── Tab 1: Daily Entries   → External milk purchases
├── Tab 2: Vendors         → Vendor management
└── Tab 3: Analytics       → Procurement analytics
```

---

## Implementation Steps

### Step 1: Create New Procurement Page
Create a new dedicated page at `src/pages/Procurement.tsx` that will house:
- **Daily Entries Tab**: The current `MilkProcurement` component for recording vendor milk purchases
- **Vendors Tab**: The current `VendorManagement` component for managing vendor details
- **Analytics Tab**: The current `MilkProcurementAnalytics` component for visualizations

The page will have its own header with the title "Milk Procurement" and description emphasizing external vendor purchases.

### Step 2: Simplify Production Page
Modify `src/pages/Production.tsx` to:
- Remove the 4-tab structure, focusing only on own production
- Keep the stats cards (Today's Total, Morning Session, Evening Session)
- Keep the production data table and recording dialog
- Keep the milk history dialog functionality
- Remove imports for `MilkProcurement`, `VendorManagement`, and `MilkProcurementAnalytics`

### Step 3: Add New Route
Update `src/App.tsx` to add the new route:
```tsx
<Route path="/procurement" element={<ProcurementPage />} />
```

### Step 4: Update Navigation
**Sidebar (`AppSidebar.tsx`)**:
- Keep "Milk Production" pointing to `/production`
- Add new "Milk Procurement" entry pointing to `/procurement` with a `ShoppingCart` or `Truck` icon
- Both items will be in the "production" section for role-based access

**Mobile Navbar (`MobileNavbar.tsx`)**:
- Add matching navigation entry for mobile users

### Step 5: Update Quick Actions
Modify `QuickActionsCard.tsx`:
- Change "Procurement" action from `/production?tab=procurement` to `/procurement`

### Step 6: Update Deep Links
Fix any URL parameters that reference the old tab structure:
- `?tab=procurement` links should point to `/procurement`
- The `?action=add` parameter on Production page remains unchanged

---

## Files to be Modified

| File | Changes |
|------|---------|
| `src/pages/Procurement.tsx` | **NEW** - Dedicated procurement page with Vendors & Analytics tabs |
| `src/pages/Production.tsx` | Remove procurement tabs, simplify to own production only |
| `src/App.tsx` | Add route for `/procurement` |
| `src/components/layout/AppSidebar.tsx` | Add "Milk Procurement" nav item |
| `src/components/mobile/MobileNavbar.tsx` | Add "Milk Procurement" nav item |
| `src/components/dashboard/QuickActionsCard.tsx` | Update Procurement link to `/procurement` |
| `src/hooks/useUserRole.ts` | Verify "production" section permissions cover procurement |

---

## Technical Details

### New Navigation Item
```typescript
{ title: "Milk Procurement", href: "/procurement", icon: ShoppingCart, section: "production" }
```

By using `section: "production"`, all existing role permissions for the production section automatically apply to procurement as well:
- `super_admin`, `manager`, `farm_worker` will have access

### New Page Structure (Procurement.tsx)
```tsx
// Tab structure for Procurement page
<Tabs value={activeTab}>
  <TabsList>
    <TabsTrigger value="entries">Daily Entries</TabsTrigger>
    <TabsTrigger value="vendors">Vendors</TabsTrigger>
    <TabsTrigger value="analytics">Analytics</TabsTrigger>
  </TabsList>
  <TabsContent value="entries"><MilkProcurement /></TabsContent>
  <TabsContent value="vendors"><VendorManagement /></TabsContent>
  <TabsContent value="analytics"><MilkProcurementAnalytics /></TabsContent>
</Tabs>
```

### URL Parameter Handling
The new `/procurement` page will support:
- `?tab=vendors` - Opens directly to Vendors tab
- `?tab=analytics` - Opens directly to Analytics tab
- Default opens to Daily Entries tab

---

## Benefits of Separation

1. **Clearer Navigation**: Users immediately understand the difference between own production and external procurement
2. **Better UX**: Each page is focused on its specific purpose
3. **Scalability**: Easier to add features specific to each module
4. **Permissions**: Can add separate role permissions for procurement if needed in the future
5. **URL Sharing**: Direct links to procurement vs production are more intuitive

---

## Backward Compatibility

- Existing bookmarks to `/production` will continue to work (showing own production)
- The old `?tab=procurement` parameter will be handled gracefully (redirect or ignore)
- All existing data and functionality remain unchanged - this is purely a UI restructuring
