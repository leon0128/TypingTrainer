func squares(ctx context.Context, limit int) <-chan int {
	out := make(chan int)
	go func() {
		defer close(out)
		for n := 1; n <= limit; n++ {
			select {
			case out <- n * n:
			case <-ctx.Done():
				return
			}
		}
	}()
	return out
}
