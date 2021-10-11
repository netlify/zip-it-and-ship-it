declare module 'require-package-name' {
  export default function requirePackageName(requireStatement: string): string
}

declare module 'is-builtin-module' {
  export default function isBuiltInModule(moduleName: string): boolean
}
