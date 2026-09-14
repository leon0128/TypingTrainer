func fizzBuzz(n int) string {
	var b strings.Builder
	for i := range n {
		value := i + 1
		switch {
		case value%15 == 0:
			b.WriteString("FizzBuzz")
		case value%3 == 0:
			b.WriteString("Fizz")
		case value%5 == 0:
			b.WriteString("Buzz")
		default:
			b.WriteString(strconv.Itoa(value))
		}
		b.WriteByte('\n')
	}
	return b.String()
}
