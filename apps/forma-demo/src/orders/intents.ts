import { boundary } from "@xndrjs/forma";
import type { FindError, Order, OrderId } from "./types.js";

export const Orders = boundary("orders");

export const FindOrder = Orders.intent<OrderId, Order, FindError>("find");
export const GetOrder = Orders.intent<OrderId, Order, FindError>("get");
