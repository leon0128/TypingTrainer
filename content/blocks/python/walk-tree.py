def walk(node, depth=0, max_depth=32):
    if depth > max_depth:
        raise RecursionError(f"tree is deeper than {max_depth} levels")
    yield depth, node["name"]
    for child in node.get("children", []):
        yield from walk(child, depth + 1, max_depth)
