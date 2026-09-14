func closeAll(closers ...io.Closer) (err error) {
	for i := len(closers) - 1; i >= 0; i-- {
		if closeErr := closers[i].Close(); closeErr != nil {
			err = errors.Join(err, fmt.Errorf("close #%d: %w", i, closeErr))
		}
	}
	return err
}
