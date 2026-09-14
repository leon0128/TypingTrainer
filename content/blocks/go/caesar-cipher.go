func caesar(text string, shift int) string {
	shift = (shift%26 + 26) % 26
	return strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z':
			return 'a' + (r-'a'+rune(shift))%26
		case r >= 'A' && r <= 'Z':
			return 'A' + (r-'A'+rune(shift))%26
		default:
			return r
		}
	}, text)
}
