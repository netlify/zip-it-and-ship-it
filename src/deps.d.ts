declare module 'require-package-name' {
  export default function requirePackageName(requireStatement: string): string
}

declare module 'is-builtin-module' {
  export default function isBuiltInModule(moduleName: string): boolean
}

declare module 'precinct' {
  export function paperwork(path: string, { includeCore: boolean }): Promise<string[]>
}

declare module 'read-package-json-fast' {
  export default function readPackageJsonFast(
    path: string,
  ): Promise<import('./runtimes/node/utils/package_json').PackageJson>
}
