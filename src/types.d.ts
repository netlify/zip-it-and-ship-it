declare module 'require-package-name' {
  function requirePackageName(name: string): string | null

  export default requirePackageName
}

declare module 'precinct' {
  interface PrecinctConfig {
    type?: string
  }
  export function paperwork(
    filepath: string,
    options?: PrecinctConfig & { includeCore?: boolean; fileSystem?: import('fs') },
  ): string[]
}
