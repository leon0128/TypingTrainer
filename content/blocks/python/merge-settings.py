def merge_settings(defaults, overrides):
    merged = defaults | overrides
    for key, value in defaults.items():
        if isinstance(value, dict) and isinstance(overrides.get(key), dict):
            merged[key] = merge_settings(value, overrides[key])
    return merged
