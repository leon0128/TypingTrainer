class Temperature:
    def __init__(self, celsius: float) -> None:
        if celsius < -273.15:
            raise ValueError(f"below absolute zero: {celsius}")
        self.celsius = celsius
        self.fahrenheit = celsius * 9 / 5 + 32
