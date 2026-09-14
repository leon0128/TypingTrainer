def primes_below(limit):
    if limit < 3:
        return []
    is_prime = bytearray([1]) * limit
    is_prime[0] = is_prime[1] = 0
    for n in range(2, math.isqrt(limit - 1) + 1):
        if is_prime[n]:
            is_prime[n * n :: n] = bytes(len(range(n * n, limit, n)))
    return [n for n, flag in enumerate(is_prime) if flag]
