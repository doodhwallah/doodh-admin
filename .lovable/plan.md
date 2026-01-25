
# PIN Reset/Change System - Complete Fix

## Problem Summary
Users cannot change or reset their PIN because of multiple interconnected issues in the authentication flow.

## Root Causes Identified

### 1. Database Functions Can't Find Cryptography Functions
The functions `update_pin_only` and `update_user_profile_with_pin` use PostgreSQL's `crypt()` and `gen_salt()` functions, but these are in the `extensions` schema. Currently, the functions only search in `public` schema, so the cryptography calls silently fail.

### 2. No PIN Hashes Stored in Database
All users have empty PIN hash values. When creating accounts, the PIN hash storage silently failed due to issue #1, so no hashes were ever saved.

### 3. Change PIN Verification Always Fails
The change-pin system first verifies the current PIN by checking the stored hash. Since there's no hash stored, this verification always fails with "Current PIN is incorrect".

### 4. Bootstrap Process Doesn't Save PIN Hash
When the super admin account was created, the PIN hash was never stored because that step was missing from the bootstrap process.

## Solution Overview

This fix will:
- Update database functions to find cryptography correctly
- Add PIN hash storage to the bootstrap process
- Improve the change-pin flow to handle first-time PIN setup
- Fix the reset-pin function for admins
- Restore PIN hashes for all existing users

---

## Implementation Steps

### Step 1: Fix Database Functions
Update the `update_pin_only` and `update_user_profile_with_pin` functions to include `extensions` in their search path so they can find `crypt()` and `gen_salt()`.

### Step 2: Fix the `change-pin` Edge Function
Modify the change-pin function to:
- First check if user has a PIN hash stored
- If no hash exists (first-time setup), verify the current PIN against the auth password instead
- After successful verification, store the new PIN hash AND update the auth password

### Step 3: Fix the `reset-user-pin` Edge Function
The reset function is simpler since admins don't need to verify the old PIN, but it should:
- Update both the PIN hash in the profiles table
- Update the auth password for consistency

### Step 4: Fix the `bootstrap-admin` Edge Function
Add PIN hash storage to the bootstrap process so new admin accounts have proper PIN hashes from the start.

### Step 5: Create a Backfill Migration
Run a one-time operation to set PIN hashes for all existing users based on their current auth passwords (which are their PINs).

---

## Files to be Modified

| File | Changes |
|------|---------|
| `supabase/functions/change-pin/index.ts` | Add fallback verification against auth password when no PIN hash exists; ensure proper hash storage |
| `supabase/functions/reset-user-pin/index.ts` | Ensure both PIN hash and auth password are updated consistently |
| `supabase/functions/bootstrap-admin/index.ts` | Add PIN hash storage during bootstrap |
| Database migration | Fix function search paths to include `extensions` schema |

---

## Technical Details

### Database Function Fix
```sql
-- Current (broken):
CREATE FUNCTION update_pin_only(...)
SET search_path TO 'public'

-- Fixed:
CREATE FUNCTION update_pin_only(...)
SET search_path TO 'public', 'extensions'
```

### Change PIN Flow (New Logic)
```text
1. User submits current PIN + new PIN
2. Check if pin_hash exists in profiles
3. IF pin_hash exists:
   → Verify using crypt(current_pin, pin_hash)
4. IF pin_hash is NULL:
   → Verify using auth.signInWithPassword (current_pin = auth password)
5. On success:
   → Update profiles.pin_hash using crypt(new_pin, gen_salt('bf'))
   → Update auth password to new_pin
```

### Reset PIN Flow (Admin Action)
```text
1. Admin clicks "Reset PIN" for a user
2. Admin enters new 6-digit PIN
3. Edge function (with admin verification):
   → Update profiles.pin_hash using crypt(new_pin, gen_salt('bf'))
   → Update auth password to new_pin
4. User can now login with new PIN
```

---

## Expected Outcome

After implementing these fixes:
- Users can change their own PIN from Settings → Security
- Super Admin can reset any user's PIN from User Management
- New users created via "Add New User" will have proper PIN hashes
- Existing users will have their PIN hashes restored
- The system maintains consistency between PIN hash and auth password

---

## Verification Steps

After implementation:
1. Test changing PIN as super admin (Settings → Security)
2. Test resetting another user's PIN (User Management → Reset PIN)
3. Verify the user can login with the new PIN
4. Check database to confirm pin_hash is no longer null
