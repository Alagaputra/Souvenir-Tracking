import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, unlink } from "node:fs/promises";
import { resolve, sep } from "node:path";
import pg from "pg";
import { after } from "node:test";
import { query as runtimeQuery, closeDatabase } from "../lib/local-db.mjs";
if (!process.env.TEST_DATABASE_URL || !process.env.TEST_DATABASE_ADMIN_URL ||
    !new URL(process.env.TEST_DATABASE_URL).pathname.endsWith("_test") ||
    !new URL(process.env.TEST_DATABASE_ADMIN_URL).pathname.endsWith("_test"))
  throw new Error("Integration tests require a separate database ending in _test.");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
const fixtures = new pg.Pool({ connectionString: process.env.TEST_DATABASE_ADMIN_URL });
async function query(sql, values = []) { return (await fixtures.query(sql, values)).rows; }
after(async () => { await fixtures.end(); await closeDatabase(); });
import { handleAPI } from "../lib/local-api.mjs";
import { hashPassword, tokenHash, newSession } from "../lib/local-security.mjs";
const cleanup = { users: [], products: [], photos: [] };
const password = "Local-integration-password-123!";
async function call(path, method = "GET", body, cookie = "") {
  const headers = { origin: "http://localhost:3000" };
  if (cookie) headers.cookie = cookie;
  if (body && !(body instanceof FormData))
    headers["content-type"] = "application/json";
  const response = await handleAPI(
    new Request(`http://localhost:3000/api/${path}`, {
      method,
      headers,
      ...(body
        ? { body: body instanceof FormData ? body : JSON.stringify(body) }
        : {}),
    }),
  );
  const data = response.headers
    .get("content-type")
    ?.includes("application/json")
    ? await response.json()
    : await response.arrayBuffer();
  return { response, data, status: response.status };
}
async function account(role) {
  const id = randomUUID(),
    email = `integration-${randomUUID()}@funding.local`;
  await query(
    "WITH added AS(INSERT INTO souv.users(id,name,email,password_hash,role)VALUES($1::uuid,$2,$3,$4,$5)RETURNING id)SELECT id FROM added",
    [id, `Test ${role}`, email, await hashPassword(password), role],
  );
  cleanup.users.push(id);
  const login = await call("auth", "POST", { email, password });
  assert.equal(login.status, 200, JSON.stringify(login.data));
  const cookie = login.response.headers.get("set-cookie");
  assert.ok(cookie.includes("HttpOnly"));
  assert.ok(cookie.includes("SameSite=Lax"));
  return { id, email, cookie: cookie.split(";")[0] };
}
test("real PostgreSQL: sessions, access, stock concurrency, correction, and images", async (t) => {
  try {
    const admin = await account("admin"),
      member = await account("member"),
      other = await account("member");
    const name = "Test 'quoted' \\ Unicode — souvenir";
    const created = await call(
      "workspace",
      "POST",
      {
        action: "product",
        sku: `TEST-${Date.now()}`,
        name,
        category: "Integration",
        unit: "pcs",
        minimum: 1,
      },
      admin.cookie,
    );
    assert.equal(created.status, 200, JSON.stringify(created.data));
    const product = (
      await query("SELECT id,name FROM souv.products WHERE name=$1", [name])
    )[0];
    cleanup.products.push(product.id);
    assert.equal(product.name, name);
    const record = (who, kind, quantity, extra = {}) =>
      call(
        "workspace",
        "POST",
        {
          action: "movement",
          kind,
          quantity,
          product_id: product.id,
          request_id: randomUUID(),
          recipient: kind === "out" ? "Nasabah pengujian" : "",
          note: "Integration test",
          ...extra,
        },
        who.cookie,
      );
    const stock = async () =>
      (
        await query("SELECT stock FROM souv.products WHERE id=$1::uuid", [
          product.id,
        ])
      )[0].stock;
    let incoming, outgoing, registerProductId;
    await t.test("authentication, hashed sessions, and CSRF", async () => {
      assert.equal((await call("workspace")).status, 401);
      assert.equal(
        (
          await query(
            "SELECT token_hash FROM souv.sessions WHERE user_id=$1::uuid",
            [admin.id],
          )
        )[0].token_hash,
        tokenHash(admin.cookie.split("=")[1]),
      );
      assert.equal(
        (await call("auth", "POST", { email: admin.email, password: "wrong" }))
          .status,
        401,
      );
      const csrf = await handleAPI(
        new Request("http://localhost:3000/api/workspace", {
          method: "POST",
          headers: {
            origin: "http://evil.test",
            cookie: admin.cookie,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            action: "archive",
            id: product.id,
            active: false,
          }),
        }),
      );
      assert.equal(csrf.status, 403);
    });
    await t.test(
      "members cannot manage products, accounts, or corrections",
      async () => {
        assert.equal(
          (
            await call(
              "workspace",
              "POST",
              { action: "archive", id: product.id, active: false },
              member.cookie,
            )
          ).status,
          403,
        );
        assert.equal(
          (
            await call(
              "members",
              "POST",
              { id: other.id, active: false },
              member.cookie,
            )
          ).status,
          403,
        );
        assert.equal((await record(member, "adjust", 99)).status, 403);
      },
    );
    await t.test(
      "concurrent retries change stock once and reject conflicting payload",
      async () => {
        const request_id = randomUUID();
        const results = await Promise.all([
          record(admin, "in", 3, { request_id }),
          record(admin, "in", 3, { request_id }),
        ]);
        results.forEach((r) =>
          assert.equal(r.status, 200, JSON.stringify(r.data)),
        );
        assert.equal(await stock(), 3);
        const rows = await query(
          "SELECT id FROM souv.movements WHERE request_id=$1::uuid",
          [request_id],
        );
        assert.equal(rows.length, 1);
        incoming = rows[0].id;
        assert.equal(
          (await record(admin, "in", 4, { request_id })).status,
          400,
        );
      },
    );
    await t.test(
      "concurrent withdrawals and cancellation cannot create negative stock",
      async () => {
        const results = await Promise.all([
          record(member, "out", 3),
          record(other, "out", 3),
        ]);
        assert.equal(results.filter((r) => r.status === 200).length, 1);
        assert.equal(await stock(), 0);
        outgoing = (
          await query(
            "SELECT id FROM souv.movements WHERE product_id=$1::uuid AND kind='out'",
            [product.id],
          )
        )[0].id;
        assert.equal((await record(admin, "out", 1)).status, 400);
        assert.equal(
          (await record(admin, "reversal", 0, { reversal_of: incoming }))
            .status,
          400,
        );
        assert.equal(await stock(), 0);
      },
    );
    await t.test(
      "history is scoped and deactivation revokes existing sessions",
      async () => {
        const own = await call("workspace", "GET", undefined, member.cookie);
        assert.equal(own.status, 200);
        assert.ok(own.data.movements.every((m) => m.actor_id === member.id));
        assert.equal(own.data.members.length, 1);
        assert.equal(
          (
            await call(
              "members",
              "POST",
              { id: member.id, active: false },
              admin.cookie,
            )
          ).status,
          200,
        );
        assert.equal(
          (await call("workspace", "GET", undefined, member.cookie)).status,
          401,
        );
        assert.equal(
          (
            await call(
              "members",
              "POST",
              { id: member.id, active: true },
              admin.cookie,
            )
          ).status,
          200,
        );
      },
    );
    await t.test(
      "corrections preserve history and archiving blocks stock changes",
      async () => {
        assert.equal(
          (await record(admin, "reversal", 0, { reversal_of: outgoing }))
            .status,
          200,
        );
        assert.equal(await stock(), 3);
        assert.equal(
          (
            await query(
              "SELECT cancelled FROM souv.movements WHERE id=$1::uuid",
              [outgoing],
            )
          )[0].cancelled,
          true,
        );
        assert.equal(
          (await record(admin, "reversal", 0, { reversal_of: outgoing }))
            .status,
          400,
        );
        assert.equal((await record(admin, "adjust", 0)).status, 200);
        assert.equal(await stock(), 0);
        assert.equal(
          (
            await call(
              "workspace",
              "POST",
              { action: "archive", id: product.id, active: false },
              admin.cookie,
            )
          ).status,
          200,
        );
        assert.equal((await record(admin, "in", 1)).status, 400);
      },
    );
    await t.test("deletion requires an admin, zero stock, and no transaction history", async () => {
      const remove = (id, cookie = admin.cookie) => call(
        "workspace", "POST", { action: "delete-product", id }, cookie,
      );
      const fixture = async (stock = 0, active = true) => {
        const id = randomUUID();
        await query(
          "WITH added AS (INSERT INTO souv.products(id,sku,name,category,stock,active) VALUES($1::uuid,$2,'Delete fixture','Integration',$3,$4) RETURNING id) SELECT id FROM added",
          [id, `DEL-${id.slice(0, 8).toUpperCase()}`, stock, active],
        );
        cleanup.products.push(id);
        return id;
      };
      const empty = await fixture();
      assert.equal((await remove(empty, "")).status, 401);
      assert.equal((await remove(empty, other.cookie)).status, 403);
      const csrf = await handleAPI(new Request("http://localhost:3000/api/workspace", {
        method: "POST",
        headers: { origin: "http://evil.test", cookie: admin.cookie, "content-type": "application/json" },
        body: JSON.stringify({ action: "delete-product", id: empty }),
      }));
      assert.equal(csrf.status, 403);
      await assert.rejects(
        query("SELECT souv.delete_product($1::uuid,$2::uuid)", [member.id, empty]),
        /Hanya admin/,
      );
      assert.equal((await remove("invalid-id")).status, 400);
      const stocked = await fixture(1);
      const blockedStock = await remove(stocked);
      assert.equal(blockedStock.status, 400);
      assert.match(blockedStock.data.error, /Stok harus 0/);
      const historyBefore = await query("SELECT id FROM souv.movements WHERE product_id=$1::uuid ORDER BY id", [product.id]);
      const blockedHistory = await remove(product.id);
      assert.equal(blockedHistory.status, 400);
      assert.match(blockedHistory.data.error, /riwayat transaksi/);
      assert.deepEqual(await query("SELECT id FROM souv.movements WHERE product_id=$1::uuid ORDER BY id", [product.id]), historyBefore);
      assert.equal((await remove(empty)).status, 200);
      assert.deepEqual(await query("SELECT id FROM souv.products WHERE id=$1::uuid", [empty]), []);
      assert.equal((await remove(empty)).status, 400);
      const archived = await fixture(0, false);
      assert.equal((await remove(archived)).status, 200);
      assert.deepEqual(await query("SELECT id FROM souv.products WHERE id=$1::uuid", [archived]), []);

      // Both operations lock the product: either deletion or the incoming entry wins.
      const racing = await fixture();
      const [deleted, received] = await Promise.all([
        remove(racing),
        call("workspace", "POST", {
          action: "movement", kind: "in", quantity: 1,
          product_id: racing, request_id: randomUUID(),
        }, admin.cookie),
      ]);
      assert.deepEqual([deleted.status, received.status].sort(), [200, 400]);
      const remaining = await query("SELECT stock FROM souv.products WHERE id=$1::uuid", [racing]);
      const entries = await query("SELECT quantity FROM souv.movements WHERE product_id=$1::uuid", [racing]);
      assert.deepEqual(remaining, deleted.status === 200 ? [] : [{ stock: 1 }]);
      assert.deepEqual(entries, deleted.status === 200 ? [] : [{ quantity: 1 }]);
    });
    await t.test(
      "photo bytes stay local, require login, and match their MIME signature",
      async () => {
        const bytes = Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aH2QAAAAASUVORK5CYII=",
          "base64",
        );
        const body = new FormData();
        body.set("file", new File([bytes], "pixel.png", { type: "image/png" }));
        const uploaded = await call("upload", "POST", body, admin.cookie);
        assert.equal(uploaded.status, 200, JSON.stringify(uploaded.data));
        cleanup.photos.push(uploaded.data.url.split("/").pop());
        assert.equal((await call(uploaded.data.url.slice(5))).status, 401);
        const image = await call(
          uploaded.data.url.slice(5),
          "GET",
          undefined,
          admin.cookie,
        );
        assert.equal(image.status, 200);
        assert.deepEqual(Buffer.from(image.data), bytes);
        const invalid = new FormData();
        invalid.set(
          "file",
          new File(["not-a-png"], "fake.png", { type: "image/png" }),
        );
        assert.equal(
          (await call("upload", "POST", invalid, admin.cookie)).status,
          400,
        );
      },
    );
    await t.test("complete stock register is admin-only and includes more than 5000 movements", async () => {
      assert.equal((await call("register")).status,401);
      assert.equal((await call("register","GET",undefined,other.cookie)).status,403);
      const id=randomUUID();
      registerProductId = id;
      cleanup.products.push(id);
      await query("WITH added AS (INSERT INTO souv.products(id,sku,name,category,stock) VALUES($1::uuid,$2,'Register integration','Integration',5001) RETURNING id) SELECT id FROM added",[id,`REG-${id.slice(0,8).toUpperCase()}`]);
      await query(`WITH added AS (INSERT INTO souv.movements(request_id,request_body,product_id,actor_id,kind,quantity,product_name,product_sku,actor_name)
        SELECT gen_random_uuid(),'{}'::jsonb,$1::uuid,$2::uuid,'in',1,'Register integration','REG','Test admin' FROM generate_series(1,5001) RETURNING id) SELECT count(*) FROM added`,[id,admin.id]);
      const response=await call("register","GET",undefined,admin.cookie);
      assert.equal(response.status,200,JSON.stringify(response.data));
      assert.equal(response.response.headers.get("cache-control"),"no-store");
      assert.equal(response.data.products.find(p=>p.id===id).stock,5001);
      assert.equal(response.data.movements.filter(m=>m.product_id===id).length,5001);
      assert.ok(Number.isFinite(new Date(response.data.exported_at).getTime()));
      assert.ok(response.data.movements.every(m=>!('request_body' in m)));
      assert.ok(!JSON.stringify(response.data).includes('password_hash'));
    });
    await t.test("runtime cannot change schema, stock or passwords directly", async () => {
      const [role] = await runtimeQuery("SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user");
      assert.deepEqual(role, { rolsuper:false, rolcreatedb:false, rolcreaterole:false, rolbypassrls:false });
      await assert.rejects(runtimeQuery("UPDATE souv.products SET stock=stock WHERE false"));
      await assert.rejects(runtimeQuery("UPDATE souv.users SET password_hash=password_hash WHERE false"));
      const [permissions] = await runtimeQuery("SELECT has_schema_privilege(current_user,'souv','CREATE') AS ddl,has_table_privilege(current_user,'souv.schema_migrations','SELECT') AS migrations");
      assert.deepEqual(permissions, { ddl:false, migrations:false });
    });
    await t.test("history pages and exports include older rows beyond 5000, with WIB dates and member scope", async () => {
      const fixture = { id: registerProductId };
      await query(`INSERT INTO souv.movements(request_id,request_body,product_id,actor_id,kind,quantity,recipient,product_name,product_sku,actor_name,created_at)
        VALUES(gen_random_uuid(),'{}'::jsonb,$1,$2,'in',1,'Old recipient','Old matching souvenir','REG','Test admin','2020-01-01T17:00:00Z')`,[fixture.id,admin.id]);
      await query("UPDATE souv.products SET stock=stock+1 WHERE id=$1",[fixture.id]);
      const path='history?product='+fixture.id;
      assert.equal((await call(path)).status,401);
      const first=await call(path+'&pageSize=100','GET',undefined,admin.cookie);
      const second=await call(path+'&pageSize=100&page=2','GET',undefined,admin.cookie);
      assert.equal(first.status,200,JSON.stringify(first.data));
      assert.equal(first.data.total,5002); assert.equal(first.data.movements.length,100);
      assert.equal(new Set([...first.data.movements,...second.data.movements].map(m=>m.id)).size,200);
      const old=await call(path+'&from=2020-01-02&to=2020-01-02&search=Old%20recipient','GET',undefined,admin.cookie);
      assert.equal(old.data.total,1); assert.equal(old.data.movements[0].product_name,'Old matching souvenir');
      const full=await call(path+'&export=1','GET',undefined,admin.cookie);
      assert.equal(full.data.movements.length,5002);
      const scoped=await call(path+'&actor='+admin.id+'&export=1','GET',undefined,other.cookie);
      assert.equal(scoped.data.total,0); assert.deepEqual(scoped.data.movements,[]);
      for(const invalid of ['page=0','pageSize=101','from=2020-02-30','from=2021-01-01&to=2020-01-01','kind=invalid','product=oops'])
        assert.equal((await call('history?'+invalid,'GET',undefined,admin.cookie)).status,400,invalid);
      const summary=await call('workspace','GET',undefined,admin.cookie);
      assert.ok(summary.data.summary.incoming>=5001);
      assert.ok(summary.data.movements.length<=25);
      assert.ok(!JSON.stringify(full.data).includes('request_body'));
    });
    await t.test("password change verifies current password, rotates sessions and preserves member role", async () => {
      const [{password_hash:oldHash}] = await query("SELECT password_hash FROM souv.users WHERE id=$1",[other.id]);
      const secondLogin=await call('auth','POST',{email:other.email,password});
      const secondCookie=secondLogin.response.headers.get('set-cookie').split(';')[0];
      assert.equal((await call('account','POST',{current_password:'wrong',new_password:'New-password-for-test-123!'},other.cookie)).status,403);
      assert.equal((await call('account','POST',{current_password:password,new_password:'short'},other.cookie)).status,400);
      const changed=await call('account','POST',{current_password:password,new_password:'New-password-for-test-123!'},other.cookie);
      assert.equal(changed.status,200,JSON.stringify(changed.data));
      const [staleLogin] = await runtimeQuery("SELECT souv.create_session($1::uuid,$2,$3) AS user_id",[other.id,oldHash,tokenHash(newSession())]);
      assert.equal(staleLogin.user_id,null);
      assert.equal((await call('workspace','GET',undefined,other.cookie)).status,401);
      assert.equal((await call('workspace','GET',undefined,secondCookie)).status,401);
      other.cookie=changed.response.headers.get('set-cookie').split(';')[0];
      assert.equal((await call('workspace','GET',undefined,other.cookie)).data.user.role,'member');
      assert.equal((await call('auth','POST',{email:other.email,password})).status,401);
      assert.equal((await call('auth','POST',{email:other.email,password:'New-password-for-test-123!'})).status,200);
      assert.equal((await call('auth','POST',null)).status,400);
    });
    await t.test("operator recovery resets an existing account and revokes its sessions", async () => {
      const recovered = await account("member");
      const result = await promisify(execFile)(process.execPath, ["scripts/reset-password.mjs", "--email", recovered.email], {
        env: { ...process.env, DATABASE_ADMIN_URL: process.env.TEST_DATABASE_ADMIN_URL }, windowsHide: true,
      });
      const file = result.stdout.trim().split(" di ").pop();
      const recoveryRoot = resolve("../.local/account-recovery") + sep;
      assert.ok(resolve(file).startsWith(recoveryRoot));
      try {
        const text = await readFile(file,"utf8");
        const password = /Password sementara: (.+)/.exec(text)[1];
        assert.ok(!result.stdout.includes(password));
        assert.equal((await call("workspace","GET",undefined,recovered.cookie)).status,401);
        assert.equal((await call("auth","POST",{email:recovered.email,password})).status,200);
      } finally { await unlink(file); }
    });
    await t.test("logout destroys the session", async () => {
      const result = await call("auth", "DELETE", undefined, other.cookie);
      assert.equal(result.status, 200);
      assert.ok(
        result.response.headers.get("set-cookie").includes("Max-Age=0"),
      );
      assert.equal(
        (await call("workspace", "GET", undefined, other.cookie)).status,
        401,
      );
    });
  } finally {
    for (const id of cleanup.products) {
      await query(
        "WITH removed AS(DELETE FROM souv.movements WHERE product_id=$1::uuid AND kind='reversal' RETURNING id)SELECT count(*) FROM removed",
        [id],
      );
      await query(
        "WITH removed AS(DELETE FROM souv.movements WHERE product_id=$1::uuid RETURNING id)SELECT count(*) FROM removed",
        [id],
      );
      await query(
        "WITH removed AS(DELETE FROM souv.products WHERE id=$1::uuid RETURNING id)SELECT count(*) FROM removed",
        [id],
      );
    }
    for (const id of cleanup.photos)
      await query(
        "WITH removed AS(DELETE FROM souv.photos WHERE id=$1::uuid RETURNING id)SELECT count(*) FROM removed",
        [id],
      );
    for (const id of cleanup.users)
      await query(
        "WITH removed AS(DELETE FROM souv.users WHERE id=$1::uuid RETURNING id)SELECT count(*) FROM removed",
        [id],
      );
  }
});
