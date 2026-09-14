def letter_grade(score, cutoffs=(60, 70, 80, 90), grades="FDCBA"):
    if not 0 <= score <= 100:
        raise ValueError(f"score out of range: {score}")
    index = bisect.bisect_right(cutoffs, score)
    return grades[index]
