class Account {
  #balance = 0;
  constructor(readonly owner: string) {}
  deposit(amount: number): void {
    if (amount <= 0) {
      throw new Error("deposit must be positive");
    }
    this.#balance += amount;
  }
  withdraw(amount: number): void {
    if (amount > this.#balance) {
      throw new Error(`insufficient funds for ${this.owner}`);
    }
    this.#balance -= amount;
  }
  get balance(): number {
    return this.#balance;
  }
}
