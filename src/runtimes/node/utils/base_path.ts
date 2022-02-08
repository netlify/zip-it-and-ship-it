import commonPathPrefix from 'common-path-prefix'

export const getBasePath = (dirnames: string[]): string => {
  if (dirnames.length === 1) {
    return dirnames[0]
  }

  return commonPathPrefix(dirnames)
}
