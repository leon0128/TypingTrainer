func bits(a, b uint8, ch chan uint8) uint8 {
	mask := a &^ b
	a <<= 1
	b--
	v := <-ch
	return a<<2 | b + mask - -v
}
