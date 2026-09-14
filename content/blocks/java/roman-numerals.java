static String toRoman(int number) {
  if (number < 1 || number > 3999) {
    throw new IllegalArgumentException("out of range: " + number);
  }
  int[] values = {1000, 900, 500, 400, 100, 90, 50, 40, 10, 9, 5, 4, 1};
  String[] symbols = "M CM D CD C XC L XL X IX V IV I".split(" ");
  StringBuilder roman = new StringBuilder();
  for (int i = 0; i < values.length; i++) {
    while (number >= values[i]) {
      roman.append(symbols[i]);
      number -= values[i];
    }
  }
  return roman.toString();
}
