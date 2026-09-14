def handle(command):
    match command.split():
        case ["go", direction] if direction in {"north", "south", "east", "west"}:
            return f"moving {direction}"
        case ["take", *items] if items:
            return f"taking {', '.join(items)}"
        case ["quit" | "exit"]:
            return "goodbye"
        case _:
            return f"unknown command: {command!r}"
