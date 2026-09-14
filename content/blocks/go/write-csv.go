func writeScores(w io.Writer, scores map[string]int) error {
	out := csv.NewWriter(w)
	if err := out.Write([]string{"player", "score"}); err != nil {
		return err
	}
	for _, name := range slices.Sorted(maps.Keys(scores)) {
		record := []string{name, strconv.Itoa(scores[name])}
		if err := out.Write(record); err != nil {
			return err
		}
	}
	out.Flush()
	return out.Error()
}
