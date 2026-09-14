def count_islands(grid):
    rows, cols = len(grid), len(grid[0]) if grid else 0
    seen = set()
    islands = 0
    for r, c in itertools.product(range(rows), range(cols)):
        if grid[r][c] != "#" or (r, c) in seen:
            continue
        islands += 1
        queue = collections.deque([(r, c)])
        seen.add((r, c))
        while queue:
            y, x = queue.popleft()
            for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                if 0 <= ny < rows and 0 <= nx < cols and grid[ny][nx] == "#":
                    if (ny, nx) not in seen:
                        seen.add((ny, nx))
                        queue.append((ny, nx))
    return islands
