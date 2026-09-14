def roman_to_int(numeral):
    values = {"I": 1, "V": 5, "X": 10, "L": 50, "C": 100, "D": 500, "M": 1000}
    total = 0
    for current, following in itertools.zip_longest(numeral, numeral[1:]):
        value = values[current]
        if following is not None and value < values[following]:
            total -= value
        else:
            total += value
    return total
