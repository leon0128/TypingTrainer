func countdown(from int) iter.Seq2[int, string] {
	return func(yield func(int, string) bool) {
		for n := from; n >= 0; n-- {
			label := strconv.Itoa(n)
			if n == 0 {
				label = "liftoff"
			}
			if !yield(n, label) {
				return
			}
		}
	}
}
