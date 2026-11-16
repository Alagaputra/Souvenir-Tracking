CREATE FUNCTION souv.clear_login_attempt(p_key text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
 DELETE FROM souv.login_attempts WHERE key=p_key;
$$;
REVOKE ALL ON FUNCTION souv.clear_login_attempt(text) FROM PUBLIC;
