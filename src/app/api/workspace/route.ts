import { handleAPI } from "@/lib/local-api.mjs";
// Runtime Node.js diperlukan oleh adapter psql. GET memuat snapshot workspace;
// POST meneruskan perubahan ke dispatcher yang sama di local-api.mjs.
export const runtime = "nodejs";
export const GET = handleAPI;
export const POST = handleAPI;
