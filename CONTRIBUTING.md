# CONTRIBUTING

Contributions are always welcome, no matter how large or small. Before contributing, please read the [code of conduct](CODE_OF_CONDUCT.md).

## Setup

> Install Node.js + npm on your system: https://nodejs.org/en/download/

```sh
$ git clone https://github.com/netlify/zip-it-and-ship-it
$ cd zip-it-and-ship-it
$ npm install
$ npm test
```

You can also use yarn.


## Testing

The following things are tested for:

- Dependencies (used an unused)
- Linting

## Releasing

```console
# Make changes
# Update README docs if they have changed.
$ npm version [major|minor|patch]
# This bumps the version number and CHANGELOG
$ npm publish
# This pushes the latest HEAD and tags, and creates a Github Release, then publishes to npm
```

The CLI is built with [pkg](https://github.com/zeit/pkg) and uploaded to the [corresponding Github release](https://github.com/netlify/zip-it-and-ship-it/releases).  It is consumed in the buildbot with [binrc](https://github.com/netlify/binrc).

## License

By contributing to Netlify Node Client, you agree that your contributions will be licensed
under its [MIT license](LICENSE).
