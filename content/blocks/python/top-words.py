def top_words(text, k=3):
    words = re.findall(r"[a-z']+", text.lower())
    counts = collections.Counter(words)
    for word, count in counts.most_common(k):
        print(f"{word:<12} {count:>4}")
    return counts.most_common(k)
