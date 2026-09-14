func processAll(tasks []func(), limit int) {
	semaphore := make(chan struct{}, limit)
	var wg sync.WaitGroup
	for _, task := range tasks {
		wg.Add(1)
		semaphore <- struct{}{}
		go func() {
			defer func() {
				<-semaphore
				wg.Done()
			}()
			task()
		}()
	}
	wg.Wait()
}
