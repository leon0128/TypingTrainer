func pollUntilCanceled(ctx context.Context, interval time.Duration, check func() bool) error {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		if check() {
			return nil
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
	}
}
