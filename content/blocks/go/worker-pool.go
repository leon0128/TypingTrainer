func squareAll(inputs []int, workers int) []int {
	results := make([]int, len(inputs))
	jobs := make(chan int)
	var wg sync.WaitGroup
	for range workers {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for index := range jobs {
				results[index] = inputs[index] * inputs[index]
			}
		}()
	}
	for index := range inputs {
		jobs <- index
	}
	close(jobs)
	wg.Wait()
	return results
}
