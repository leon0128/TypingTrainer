static class InsufficientFundsException extends RuntimeException {
  InsufficientFundsException(String account, long balance, long amount) {
    super(
        String.format(
            "account %s has %d but %d was requested (short by %d)",
            account, balance, amount, amount - balance));
  }
}
