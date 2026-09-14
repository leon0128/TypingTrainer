func loadConfig(path string) (addr string, workers int, err error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", 0, fmt.Errorf("read config: %w", err)
	}
	var raw struct {
		Addr    string `json:"addr"`
		Workers int    `json:"workers"`
	}
	if err := json.Unmarshal(data, &raw); err != nil {
		return "", 0, fmt.Errorf("parse %s: %w", path, err)
	}
	if raw.Workers <= 0 {
		raw.Workers = runtime.NumCPU()
	}
	return raw.Addr, raw.Workers, nil
}
