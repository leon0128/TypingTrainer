def group_by_initial(words):
    groups = collections.defaultdict(list)
    for word in words:
        if not word:
            continue
        groups[word[0].lower()].append(word)
    return {letter: sorted(group) for letter, group in sorted(groups.items())}
