func newCounter() (increment func() int, current func() int) {
	var mu sync.Mutex
	count := 0
	increment = func() int {
		mu.Lock()
		defer mu.Unlock()
		count++
		return count
	}
	current = func() int {
		mu.Lock()
		defer mu.Unlock()
		return count
	}
	return increment, current
}
