func TestRepeat(t *testing.T) {
	tests := []struct {
		name  string
		input string
		count int
		want  string
	}{
		{"empty", "", 3, ""},
		{"once", "go", 1, "go"},
		{"many", "ab", 3, "ababab"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := strings.Repeat(tt.input, tt.count); got != tt.want {
				t.Errorf(
					"Repeat(%q, %d) = %q, want %q",
					tt.input, tt.count, got, tt.want,
				)
			}
		})
	}
}
