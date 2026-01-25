
# Fix Login After PIN Reset - Domain Mismatch Issue

## Problem Found
After admin resets a user's PIN, the user still cannot log in because there is a **mismatch between email domains** in the database vs what the login page uses.

### Current State
| User | Email in Database | Login Tries |
|------|-------------------|-------------|
| Kanhaiya Lal | `9451574464@doodhwallah.app` | `9451574464@awadhdairy.com` |
| Surendra Singh | `9415688104@doodhwallah.app` | `9415688104@awadhdairy.com` |

The login page constructs the email as `phone@awadhdairy.com`, but some users were created earlier with a different domain (`@doodhwallah.app`). Even when the PIN reset correctly updates the password, the login fails because it searches for a non-existent email.

---

## Solution

Update all user emails from `@doodhwallah.app` to `@awadhdairy.com` using a database migration. This ensures all users can log in with the standard domain.

---

## Implementation Steps

### Step 1: Database Migration
Run a migration to update all auth.users emails from the old domain to the new domain:

```sql
-- Update all users with @doodhwallah.app to @awadhdairy.com
UPDATE auth.users 
SET email = REPLACE(email, '@doodhwallah.app', '@awadhdairy.com')
WHERE email LIKE '%@doodhwallah.app';
```

### Step 2: Verify Change
After the migration, verify that all users now have the correct domain:
- Kanhaiya Lal: `9451574464@awadhdairy.com`
- Surendra Singh: `9415688104@awadhdairy.com`
- Super Admin: `7897716792@awadhdairy.com`

---

## Why This Fixes The Issue

| Before Fix | After Fix |
|------------|-----------|
| User has email `@doodhwallah.app` | User has email `@awadhdairy.com` |
| Login looks for `@awadhdairy.com` | Login looks for `@awadhdairy.com` |
| No match → Login fails | Match found → Login succeeds |

---

## No Code Changes Required

The login page (`Auth.tsx`), `create-user`, and `bootstrap-admin` functions are already correct - they all use `@awadhdairy.com`. Only the database needs to be updated to fix the legacy users.

---

## Affected Users

Based on database analysis, these users need their email domain updated:
1. **7897716792@doodhwallah.app** → `7897716792@awadhdairy.com` (duplicate admin - may need to be deleted)
2. **9451574464@doodhwallah.app** → `9451574464@awadhdairy.com` (Kanhaiya Lal)
3. **9415688104@doodhwallah.app** → `9415688104@awadhdairy.com` (Surendra Singh)

---

## Risk Assessment

**Low Risk**: This is a simple text replacement that only affects the email identifier used for login. It does not affect:
- User passwords/PINs
- User profiles
- User roles
- Any other user data

---

## Expected Outcome

After implementation:
- All users will be able to log in with their phone number and PIN
- PIN reset will work correctly since the domain will match
- New users created will continue to use the correct domain
