CREATE TABLE souv.users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
 email text NOT NULL UNIQUE CHECK(email=lower(email)), password_hash text NOT NULL,
 role text NOT NULL DEFAULT 'member' CHECK(role IN ('admin','member')), active boolean NOT NULL DEFAULT true
);
CREATE TABLE souv.sessions (
 token_hash text PRIMARY KEY CHECK(length(token_hash)=64), user_id uuid NOT NULL REFERENCES souv.users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expiry ON souv.sessions(expires_at);
CREATE TABLE souv.login_attempts(key text PRIMARY KEY, attempts integer NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE souv.photos (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), mime text NOT NULL CHECK(mime IN ('image/jpeg','image/png','image/webp')),
 data bytea NOT NULL CHECK(octet_length(data) BETWEEN 1 AND 2097152)
);
CREATE TABLE souv.products (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sku text NOT NULL UNIQUE CHECK(sku ~ '^[A-Z0-9_-]{1,40}$'),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160), category text NOT NULL CHECK(length(category) BETWEEN 1 AND 60),
 unit text NOT NULL DEFAULT 'pcs' CHECK(length(unit) BETWEEN 1 AND 30), minimum integer NOT NULL DEFAULT 10 CHECK(minimum BETWEEN 0 AND 1000000),
 stock integer NOT NULL DEFAULT 0 CHECK(stock>=0), photo text, active boolean NOT NULL DEFAULT true
);
CREATE TABLE souv.movements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), request_id uuid NOT NULL UNIQUE, request_body jsonb NOT NULL,
 product_id uuid NOT NULL REFERENCES souv.products(id), actor_id uuid NOT NULL REFERENCES souv.users(id),
 kind text NOT NULL CHECK(kind IN ('in','out','adjust','reversal')), quantity integer NOT NULL,
 recipient text NOT NULL DEFAULT '' CHECK(length(recipient)<=160), note text NOT NULL DEFAULT '' CHECK(length(note)<=500),
 product_name text NOT NULL, product_sku text NOT NULL, actor_name text NOT NULL,
 reversal_of uuid UNIQUE REFERENCES souv.movements(id), cancelled boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK((kind='in' AND quantity>0) OR (kind='out' AND quantity<0 AND length(trim(recipient))>0) OR kind IN ('adjust','reversal')),
 CHECK((kind='reversal')=(reversal_of IS NOT NULL))
);
CREATE INDEX movements_actor_date ON souv.movements(actor_id,created_at DESC);
CREATE INDEX movements_product_date ON souv.movements(product_id,created_at DESC);

CREATE FUNCTION souv.claim_login_attempt(p_key text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE counter integer;
BEGIN
 DELETE FROM souv.login_attempts WHERE expires_at<now()-interval '1 day';
 INSERT INTO souv.login_attempts(key,attempts,expires_at) VALUES(p_key,1,now()+interval '15 minutes')
 ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN souv.login_attempts.expires_at<now() THEN 1 ELSE souv.login_attempts.attempts+1 END,
 expires_at=CASE WHEN souv.login_attempts.expires_at<now() THEN now()+interval '15 minutes' ELSE souv.login_attempts.expires_at END
 RETURNING attempts INTO counter;
 RETURN counter<=10;
END;$$;

CREATE FUNCTION souv.write_action(p_actor uuid,b jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE actor souv.users; product souv.products; original souv.movements; existing souv.movements;
 target uuid; request_uuid uuid; kind text; amount integer; delta integer; payload jsonb; result uuid; active_value boolean;
BEGIN
 SELECT * INTO actor FROM souv.users WHERE id=p_actor AND active FOR SHARE;
 IF actor.id IS NULL THEN RAISE EXCEPTION 'SOUV:Akun tidak aktif.'; END IF;
 IF b->>'action'='movement' THEN
  kind:=b->>'kind';request_uuid:=(b->>'request_id')::uuid;target:=(b->>'product_id')::uuid;amount:=(b->>'quantity')::integer;
  IF request_uuid IS NULL OR kind IS NULL OR kind NOT IN ('in','out','adjust','reversal') THEN RAISE EXCEPTION 'SOUV:Permintaan tidak valid.'; END IF;
  IF kind IN ('adjust','reversal') AND actor.role<>'admin' THEN RAISE EXCEPTION 'SOUV:Hanya admin yang dapat melakukan koreksi.'; END IF;
  payload:=b-'action';
  -- Serialize identical request IDs even when two retries refer to different products.
  PERFORM pg_advisory_xact_lock(hashtextextended(request_uuid::text,0));
  SELECT * INTO existing FROM souv.movements WHERE request_id=request_uuid;
  IF existing.id IS NOT NULL THEN
   IF existing.actor_id<>actor.id OR existing.request_body<>payload THEN RAISE EXCEPTION 'SOUV:Identitas permintaan sudah digunakan.'; END IF;
   RETURN jsonb_build_object('id',existing.id);
  END IF;
  IF kind='reversal' THEN
   SELECT * INTO original FROM souv.movements WHERE id=(b->>'reversal_of')::uuid FOR UPDATE;
   IF original.id IS NULL OR original.kind='reversal' OR original.cancelled THEN RAISE EXCEPTION 'SOUV:Catatan tidak dapat dibatalkan atau sudah dibatalkan.'; END IF;
   target:=original.product_id;
  ELSIF b->>'reversal_of' IS NOT NULL THEN RAISE EXCEPTION 'SOUV:Referensi pembatalan tidak valid.';
  END IF;
  SELECT * INTO product FROM souv.products WHERE id=target FOR UPDATE;
  IF product.id IS NULL THEN RAISE EXCEPTION 'SOUV:Produk tidak ditemukan.'; END IF;
  IF NOT product.active THEN RAISE EXCEPTION 'SOUV:Aktifkan produk sebelum mencatat atau membatalkan.'; END IF;
  IF kind='reversal' THEN delta:=-original.quantity;
  ELSIF kind='adjust' THEN
   IF amount IS NULL OR amount<0 OR amount>1000000 THEN RAISE EXCEPTION 'SOUV:Stok fisik tidak valid.'; END IF;
   delta:=amount-product.stock;
   IF delta=0 THEN RAISE EXCEPTION 'SOUV:Stok fisik sama dengan stok sistem.'; END IF;
  ELSE
   IF amount IS NULL OR amount<1 OR amount>1000000 THEN RAISE EXCEPTION 'SOUV:Jumlah harus antara 1 dan 1.000.000.'; END IF;
   IF kind='out' AND length(trim(coalesce(b->>'recipient','')))=0 THEN RAISE EXCEPTION 'SOUV:Nama nasabah wajib diisi.'; END IF;
   delta:=CASE WHEN kind='out' THEN -amount ELSE amount END;
  END IF;
  IF kind IN ('adjust','reversal') AND length(trim(coalesce(b->>'note','')))=0 THEN RAISE EXCEPTION 'SOUV:Alasan koreksi wajib diisi.'; END IF;
  IF product.stock+delta<0 THEN RAISE EXCEPTION 'SOUV:Stok tidak mencukupi. Periksa stok terbaru.'; END IF;
  UPDATE souv.products SET stock=stock+delta WHERE id=product.id;
  INSERT INTO souv.movements(request_id,request_body,product_id,actor_id,kind,quantity,recipient,note,reversal_of,product_name,product_sku,actor_name)
  VALUES(request_uuid,payload,product.id,actor.id,kind,delta,coalesce(b->>'recipient',''),coalesce(b->>'note',''),(b->>'reversal_of')::uuid,product.name,product.sku,actor.name) RETURNING id INTO result;
  IF kind='reversal' THEN UPDATE souv.movements SET cancelled=true WHERE id=original.id; END IF;
 ELSIF b->>'action'='product' THEN
  IF actor.role<>'admin' THEN RAISE EXCEPTION 'SOUV:Hanya admin yang dapat mengelola produk.'; END IF;
  IF b->>'id' IS NULL THEN
   INSERT INTO souv.products(sku,name,category,unit,minimum,photo) VALUES(b->>'sku',b->>'name',b->>'category',b->>'unit',(b->>'minimum')::integer,b->>'photo') RETURNING id INTO result;
  ELSE
   UPDATE souv.products SET sku=b->>'sku',name=b->>'name',category=b->>'category',unit=b->>'unit',minimum=(b->>'minimum')::integer,photo=b->>'photo' WHERE id=(b->>'id')::uuid RETURNING id INTO result;
   IF result IS NULL THEN RAISE EXCEPTION 'SOUV:Produk tidak ditemukan.'; END IF;
  END IF;
 ELSIF b->>'action'='archive' THEN
  IF actor.role<>'admin' THEN RAISE EXCEPTION 'SOUV:Hanya admin yang dapat mengarsipkan produk.'; END IF;
  SELECT * INTO product FROM souv.products WHERE id=(b->>'id')::uuid FOR UPDATE;
  IF product.id IS NULL THEN RAISE EXCEPTION 'SOUV:Produk tidak ditemukan.'; END IF;
  active_value:=(b->>'active')::boolean;
  IF active_value IS NULL THEN RAISE EXCEPTION 'SOUV:Status tidak valid.'; END IF;
  IF NOT active_value AND product.stock<>0 THEN RAISE EXCEPTION 'SOUV:Stok harus 0 sebelum produk diarsipkan.'; END IF;
  UPDATE souv.products SET active=active_value WHERE id=product.id;
  result:=product.id;
 ELSIF b->>'action'='member' THEN
  IF actor.role<>'admin' THEN RAISE EXCEPTION 'SOUV:Hanya admin yang dapat mengelola anggota.'; END IF;
  IF b->>'id' IS NULL THEN
   INSERT INTO souv.users(name,email,password_hash,role) VALUES(b->>'name',lower(b->>'email'),b->>'password_hash',b->>'role') RETURNING id INTO result;
  ELSE
   target:=(b->>'id')::uuid;
   IF target=actor.id THEN RAISE EXCEPTION 'SOUV:Akun sendiri tidak dapat dinonaktifkan.'; END IF;
   UPDATE souv.users SET active=(b->>'active')::boolean WHERE id=target RETURNING id INTO result;
   IF result IS NULL THEN RAISE EXCEPTION 'SOUV:Anggota tidak ditemukan.'; END IF;
   IF NOT (b->>'active')::boolean THEN DELETE FROM souv.sessions WHERE user_id=target; END IF;
  END IF;
 ELSE RAISE EXCEPTION 'SOUV:Tindakan tidak dikenali.';
 END IF;
 RETURN jsonb_build_object('id',result);
END;$$;
REVOKE ALL ON SCHEMA souv FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA souv FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA souv FROM PUBLIC;
