type Action = { type: "add"; amount: number } | { type: "reset" };
function assertNever(value: never): never {
  throw new Error(`unexpected value: ${JSON.stringify(value)}`);
}
function reduce(total: number, action: Action): number {
  switch (action.type) {
    case "add":
      return total + action.amount;
    case "reset":
      return 0;
    default:
      return assertNever(action);
  }
}
