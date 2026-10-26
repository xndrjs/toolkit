import { boundary } from "@xndrjs/forma";
import type { Connection, PgFindError, PgOrder, PgOrderId } from "./types.js";

export const Postgres = boundary("postgres");

export const Ready = Postgres.intent<void, true, never>("ready");
export const ConnectionIntent = Postgres.intent<void, Connection, never>("connection");
export const SelectOrder = Postgres.intent<PgOrderId, PgOrder, PgFindError>("selectOrder");
