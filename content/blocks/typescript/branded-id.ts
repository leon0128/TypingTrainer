type Brand<T, Name extends string> = T & { readonly __brand: Name };
type UserId = Brand<string, "UserId">;
type OrderId = Brand<string, "OrderId">;
function toUserId(raw: string): UserId {
  if (!/^u_[a-z0-9]{8}$/.test(raw)) {
    throw new Error(`invalid user id: ${raw}`);
  }
  return raw as UserId;
}
function toOrderId(raw: string): OrderId {
  if (!/^o_[0-9]{10}$/.test(raw)) {
    throw new Error(`invalid order id: ${raw}`);
  }
  return raw as OrderId;
}
