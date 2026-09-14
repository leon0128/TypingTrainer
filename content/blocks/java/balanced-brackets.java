static boolean isBalanced(String code) {
  Deque<Character> stack = new ArrayDeque<>();
  for (char c : code.toCharArray()) {
    switch (c) {
      case '(', '[', '{' -> stack.push(c);
      case ')', ']', '}' -> {
        char open = c == ')' ? '(' : c == ']' ? '[' : '{';
        if (stack.isEmpty() || stack.pop() != open) {
          return false;
        }
      }
      default -> {}
    }
  }
  return stack.isEmpty();
}
