const nonNullable = <T>(value: T): value is NonNullable<T> => Boolean(value)

export { nonNullable }
