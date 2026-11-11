-- Keep transaction history intact. Lock the same product row as stock writes.
CREATE FUNCTION souv.delete_product(p_actor uuid, p_product uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE actor souv.users; product souv.products;
BEGIN
 SELECT * INTO actor FROM souv.users WHERE id=p_actor AND active FOR SHARE;
 IF actor.id IS NULL THEN RAISE EXCEPTION 'SOUV:Akun tidak aktif.'; END IF;
 IF actor.role<>'admin' THEN RAISE EXCEPTION 'SOUV:Hanya admin yang dapat menghapus produk.'; END IF;
 SELECT * INTO product FROM souv.products WHERE id=p_product FOR UPDATE;
 IF product.id IS NULL THEN RAISE EXCEPTION 'SOUV:Produk tidak ditemukan.'; END IF;
 IF product.stock<>0 THEN RAISE EXCEPTION 'SOUV:Stok harus 0 sebelum produk dihapus.'; END IF;
 IF EXISTS(SELECT 1 FROM souv.movements WHERE product_id=p_product) THEN
  RAISE EXCEPTION 'SOUV:Produk memiliki riwayat transaksi dan tidak dapat dihapus. Gunakan arsip agar riwayat tetap tersimpan.';
 END IF;
 DELETE FROM souv.products WHERE id=p_product;
 RETURN p_product;
END;$$;
REVOKE ALL ON FUNCTION souv.delete_product(uuid,uuid) FROM PUBLIC;
