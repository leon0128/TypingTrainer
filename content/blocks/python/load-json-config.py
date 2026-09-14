def load_config(path):
    try:
        with open(path, encoding="utf-8") as file:
            config = json.load(file)
    except FileNotFoundError:
        return {}
    except json.JSONDecodeError as exc:
        raise ValueError(f"{path}: invalid JSON at line {exc.lineno}") from exc
    if not isinstance(config, dict):
        raise TypeError(f"{path}: expected an object, got {type(config).__name__}")
    return config
