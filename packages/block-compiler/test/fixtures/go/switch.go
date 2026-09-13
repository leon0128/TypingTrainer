func describe(x any) string {
	switch v := x.(type) {
	case int:
		return fmt.Sprintf("int %d", v)
	case string:
		return "string " + v
	default:
		return "unknown"
	}
}
