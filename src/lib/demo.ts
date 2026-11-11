import type { Snapshot, Movement } from "./types";
const names = [
  "Tumbler Stainless",
  "Tote Bag Canvas",
  "Notebook A5",
  "Payung Lipat",
  "Pulpen Metal",
  "Mug Keramik",
  "Gantungan Kunci",
  "Pouch Travel",
];
// Demo balances include an explicit illustrative opening receipt, unlike live exports.
export function demoRegister() {
  const snapshot = demoSnapshot();
  const first = Math.min(...snapshot.movements.map(m => new Date(m.created_at).getTime())) - 86400000;
  const opening: Movement[] = snapshot.products.flatMap(p => {
    const net = snapshot.movements.filter(m => m.product_id === p.id).reduce((sum,m) => sum+m.quantity,0);
    const quantity = p.stock-net;
    return quantity !== 0 ? [{
      id:`demo-opening-${p.id}`,product_id:p.id,actor_id:snapshot.user.id,
      kind:quantity > 0 ? "in" as const : "adjust" as const,quantity,recipient:"",note:"Saldo ilustrasi untuk pratinjau register; bukan data operasional.",
      created_at:new Date(quantity > 0 ? first : Date.now()).toISOString(),reversal_of:null,
      product_name:p.name,product_sku:p.sku,actor_name:snapshot.user.name,
    }] : [];
  });
  return {products:snapshot.products,movements:[...opening,...snapshot.movements],exported_at:new Date().toISOString()};
}
const skus = [
  "TMB-001",
  "TOT-001",
  "NTB-001",
  "UMB-001",
  "PEN-001",
  "MUG-001",
  "KEY-001",
  "PCH-001",
];
const stocks = [124, 86, 12, 48, 185, 8, 72, 0];
const categories = [
  "Drinkware",
  "Tas & Aksesori",
  "Alat Tulis",
  "Tas & Aksesori",
  "Alat Tulis",
  "Drinkware",
  "Tas & Aksesori",
  "Tas & Aksesori",
];
export function demoSnapshot(): Snapshot {
  const user = {
    id: "demo-admin",
    name: "Admin Funding",
    email: "admin@funding.local",
    role: "admin" as const,
    active: true,
  };
  const members = [
    user,
    {
      id: "demo-member",
      name: "Nadia Putri",
      email: "anggota@funding.local",
      role: "member" as const,
      active: true,
    },
  ];
  const products = names.map((name, i) => ({
    id: `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    name,
    sku: skus[i],
    category: categories[i],
    stock: stocks[i],
    minimum: [20, 15, 20, 10, 30, 15, 20, 10][i],
    unit: "pcs",
    photo: null,
    active: true,
  }));
  const movements = [0, 2, 1, 5, 4, 0, 3, 2, 6, 1, 4, 0].map(
    (productIndex, i) => ({
      id: `demo-${i}`,
      product_id: products[productIndex].id,
      actor_id: i % 2 ? user.id : "demo-member",
      kind: (i === 3 || i === 7 ? "in" : "out") as "in" | "out",
      quantity: i === 3 || i === 7 ? 20 : -((i % 3) + 1),
      recipient:
        ["Budi Santoso", "Ratna Wijaya", "Ahmad Fauzi", "", "Dewi Lestari"][
          i % 5
        ] || "Budi Santoso",
      note: "Data ilustrasi",
      created_at: new Date(Date.now() - i * 17 * 3600000).toISOString(),
      reversal_of: null,
      product_name: products[productIndex].name,
      product_sku: products[productIndex].sku,
      actor_name: i % 2 ? "Admin Funding" : "Nadia Putri",
    }),
  );
  return { user, members, products, movements, demo: true };
}
