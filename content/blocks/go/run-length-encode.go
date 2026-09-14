func runLengthEncode(input string) string {
	var out strings.Builder
	runes := []rune(input)
	for i := 0; i < len(runes); {
		j := i
		for j < len(runes) && runes[j] == runes[i] {
			j++
		}
		fmt.Fprintf(&out, "%d%c", j-i, runes[i])
		i = j
	}
	return out.String()
}
