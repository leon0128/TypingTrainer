static int parseBinary(String digits) {
  if (digits.isEmpty() || digits.length() > 31) {
    throw new NumberFormatException("expected 1 to 31 binary digits");
  }
  int result = 0;
  for (int i = 0; i < digits.length(); i++) {
    char digit = digits.charAt(i);
    if (digit != '0' && digit != '1') {
      throw new NumberFormatException("not a binary digit: " + digit);
    }
    result = (result << 1) | (digit - '0');
  }
  return result;
}
