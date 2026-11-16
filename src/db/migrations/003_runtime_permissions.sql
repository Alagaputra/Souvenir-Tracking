-- Runtime can call business functions, but cannot change stock or schema directly.
ALTER FUNCTION souv.claim_login_attempt(text) SECURITY DEFINER;
ALTER FUNCTION souv.claim_login_attempt(text) SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION souv.write_action(uuid,jsonb) SECURITY DEFINER;
ALTER FUNCTION souv.write_action(uuid,jsonb) SET search_path = pg_catalog, pg_temp;
ALTER FUNCTION souv.delete_product(uuid,uuid) SECURITY DEFINER;
ALTER FUNCTION souv.delete_product(uuid,uuid) SET search_path = pg_catalog, pg_temp;

CREATE FUNCTION souv.change_password(p_actor uuid, p_expected text, p_hash text, p_token text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE actor souv.users;
BEGIN
 SELECT * INTO actor FROM souv.users WHERE id=p_actor AND active FOR UPDATE;
 IF actor.id IS NULL OR actor.password_hash<>p_expected THEN RETURN false; END IF;
 UPDATE souv.users SET password_hash=p_hash WHERE id=p_actor;
 DELETE FROM souv.sessions WHERE user_id=p_actor;
 INSERT INTO souv.sessions(token_hash,user_id,expires_at) VALUES(p_token,p_actor,now()+interval '7 days');
 RETURN true;
END;$$;
REVOKE ALL ON FUNCTION souv.change_password(uuid,text,text,text) FROM PUBLIC;
CREATE INDEX movements_date_id ON souv.movements(created_at DESC,id DESC);
