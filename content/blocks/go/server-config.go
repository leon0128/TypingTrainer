type ServerConfig struct {
	Host         string        `json:"host"`
	Port         int           `json:"port"`
	ReadTimeout  time.Duration `json:"read_timeout"`
	AllowOrigins []string      `json:"allow_origins,omitempty"`
	Debug        bool          `json:"debug"`
}
