def are_anagrams(first, second):
    letters = [
        sorted(char for char in text.lower() if char.isalnum())
        for text in (first, second)
    ]
    return letters[0] == letters[1]
