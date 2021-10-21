interface Cache {
  analysisCache?: Map<string, { isESM: boolean; [key: string]: unknown }>
  [key: string]: unknown
}

export { Cache }
