# CONTRIBUTING

Contributions are always welcome, no matter how large or small. Before contributing, please read the
[code of conduct](CODE_OF_CONDUCT.md).

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

Merge the release PR

### Creating a prerelease

1. Create a branch named `releases/<tag>/<version>` with the version you'd like to release.
2. Push the branch to the repo.

For example, a branch named `releases/rc/4.0.0` will create the version `v4.0.0-rc` and publish it under the `rc` tag.

## License

By contributing to Netlify Node Client, you agree that your contributions will be licensed under its
[MIT license](LICENSE).
