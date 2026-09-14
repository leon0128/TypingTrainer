func merge[T any](sources ...<-chan T) <-chan T {
	out := make(chan T)
	var wg sync.WaitGroup
	wg.Add(len(sources))
	for _, source := range sources {
		go func() {
			defer wg.Done()
			for value := range source {
				out <- value
			}
		}()
	}
	go func() {
		wg.Wait()
		close(out)
	}()
	return out
}
