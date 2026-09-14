def is_balanced(code):
    closing = {")": "(", "]": "[", "}": "{"}
    stack = []
    for char in code:
        if char in "([{":
            stack.append(char)
        elif char in closing:
            if not stack or stack.pop() != closing[char]:
                return False
    return not stack
