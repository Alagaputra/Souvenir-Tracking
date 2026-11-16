import type { Pool } from "pg";
declare global {
  var __souvPools: Map<string, Pool> | undefined;
}
export {};
