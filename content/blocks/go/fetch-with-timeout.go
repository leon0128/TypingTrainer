func fetchStatus(ctx context.Context, target string) (int, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, target, nil)
	if err != nil {
		return 0, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return 0, fmt.Errorf("head %s: %w", target, err)
	}
	defer resp.Body.Close()
	return resp.StatusCode, nil
}
