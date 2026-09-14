func pageParams(rawQuery string) (page, size int, err error) {
	values, err := url.ParseQuery(rawQuery)
	if err != nil {
		return 0, 0, err
	}
	page, size = 1, 20
	if v := values.Get("page"); v != "" {
		if page, err = strconv.Atoi(v); err != nil || page < 1 {
			return 0, 0, fmt.Errorf("invalid page %q", v)
		}
	}
	if v := values.Get("size"); v != "" {
		if size, err = strconv.Atoi(v); err != nil || size < 1 || size > 100 {
			return 0, 0, fmt.Errorf("invalid size %q", v)
		}
	}
	return page, size, nil
}
