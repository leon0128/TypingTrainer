func sumSquares(values []int) int {
	var wg sync.WaitGroup
	results := make(chan int, len(values))
	for _, v := range values {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			results <- n * n
		}(v)
	}
	wg.Wait()
	close(results)
	sum := 0
	for r := range results {
		sum += r
	}
	return sum
}
