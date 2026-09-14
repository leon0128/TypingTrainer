func retry(attempts int, base time.Duration, task func() error) error {
	var err error
	for attempt := range attempts {
		if err = task(); err == nil {
			return nil
		}
		delay := base * time.Duration(1<<attempt)
		log.Printf("attempt %d failed: %v; retrying in %s", attempt+1, err, delay)
		time.Sleep(delay)
	}
	return fmt.Errorf("after %d attempts: %w", attempts, err)
}
