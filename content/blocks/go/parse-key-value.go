func parseKeyValue(line string) (string, int, error) {
	key, raw, found := strings.Cut(line, "=")
	if !found {
		return "", 0, fmt.Errorf("missing '=' in %q", line)
	}
	value, err := strconv.Atoi(strings.TrimSpace(raw))
	if err != nil {
		return "", 0, fmt.Errorf("value of %s: %w", key, err)
	}
	return strings.TrimSpace(key), value, nil
}
