def hex_to_rgb(code: str) -> tuple[int, int, int]:
    digits = code.removeprefix("#")
    if len(digits) == 3:
        digits = "".join(char * 2 for char in digits)
    if len(digits) != 6 or not all(char in string.hexdigits for char in digits):
        raise ValueError(f"not a hex color: {code!r}")
    red, green, blue = (int(digits[i : i + 2], 16) for i in range(0, 6, 2))
    return red, green, blue
