def count_matches(grid, target):
    total = 0
    for row in grid:
        for cell in row:
            if cell == target:
                total += 1
    return total
