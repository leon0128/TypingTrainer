func countEvens(numbers []int) int64 {
	var evens atomic.Int64
	var wg sync.WaitGroup
	for _, n := range numbers {
		wg.Go(func() {
			if n%2 == 0 {
				evens.Add(1)
			}
		})
	}
	wg.Wait()
	return evens.Load()
}
