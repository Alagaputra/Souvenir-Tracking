-- A login that verified an old hash must not create a session after a concurrent
-- password change or recovery has revoked the previous sessions.
CREATE FUNCTION souv.create_session(p_user uuid,p_expected text,p_token text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE result uuid;
BEGIN
 SELECT id INTO result FROM souv.users WHERE id=p_user AND active AND password_hash=p_expected FOR SHARE;
 IF result IS NULL THEN RETURN NULL; END IF;
 DELETE FROM souv.sessions WHERE expires_at<now();
 INSERT INTO souv.sessions(token_hash,user_id,expires_at) VALUES(p_token,result,now()+interval '7 days');
 RETURN result;
END;$$;
REVOKE ALL ON FUNCTION souv.create_session(uuid,text,text) FROM PUBLIC;
DROP FUNCTION souv.create_session(uuid,text);
