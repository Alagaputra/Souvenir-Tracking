export type Profile = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  active: boolean;
};
export type Product = {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  minimum: number;
  stock: number;
  photo: string | null;
  active: boolean;
};
export type Movement = {
  id: string;
  product_id: string;
  actor_id: string;
  kind: "in" | "out" | "adjust" | "reversal";
  quantity: number;
  recipient: string;
  note: string;
  created_at: string;
  reversal_of: string | null;
  cancelled?: boolean;
  product_name: string;
  product_sku: string;
  actor_name: string;
};
export type Snapshot = {
  user: Profile;
  products: Product[];
  movements: Movement[];
  members: Profile[];
  demo: boolean;
  summary?: { incoming: number; given: number };
};
