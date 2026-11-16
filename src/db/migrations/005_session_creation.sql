-- A read lock needs UPDATE privileges in PostgreSQL. Keep it inside a narrow
-- function instead of granting the runtime role UPDATE on user/password rows.
CREATE FUNCTION souv.create_session(p_user uuid,p_token text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE result uuid;
BEGIN
 SELECT id INTO result FROM souv.users WHERE id=p_user AND active FOR SHARE;
 IF result IS NULL THEN RETURN NULL; END IF;
 INSERT INTO souv.sessions(token_hash,user_id,expires_at) VALUES(p_token,result,now()+interval '7 days');
 RETURN result;
END;$$;
REVOKE ALL ON FUNCTION souv.create_session(uuid,text) FROM PUBLIC;
