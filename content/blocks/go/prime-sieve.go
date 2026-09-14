func primesUpTo(limit int) []int {
	composite := make([]bool, limit+1)
	var primes []int
	for n := 2; n <= limit; n++ {
		if composite[n] {
			continue
		}
		primes = append(primes, n)
		for multiple := n * n; multiple <= limit; multiple += n {
			composite[multiple] = true
		}
	}
	return primes
}
