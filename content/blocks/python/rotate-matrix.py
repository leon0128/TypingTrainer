def rotate_clockwise(matrix):
    if not matrix:
        return []
    width = len(matrix[0])
    if any(len(row) != width for row in matrix):
        raise ValueError("matrix rows must have the same length")
    return [list(row) for row in zip(*reversed(matrix))]
