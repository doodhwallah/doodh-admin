-- Fix update_pin_only function to include extensions schema for pgcrypto
CREATE OR REPLACE FUNCTION public.update_pin_only(_user_id uuid, _pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  UPDATE public.profiles
  SET pin_hash = crypt(_pin, gen_salt('bf'))
  WHERE id = _user_id;
END;
$function$;

-- Fix update_user_profile_with_pin function to include extensions schema for pgcrypto
CREATE OR REPLACE FUNCTION public.update_user_profile_with_pin(_user_id uuid, _full_name text, _phone text, _role user_role, _pin text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  UPDATE public.profiles
  SET 
    full_name = COALESCE(_full_name, full_name),
    phone = COALESCE(_phone, phone),
    role = COALESCE(_role, role),
    pin_hash = crypt(_pin, gen_salt('bf'))
  WHERE id = _user_id;
END;
$function$;