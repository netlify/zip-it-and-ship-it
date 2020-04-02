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

```console
$ npm version [major|minor|patch]
$ npm publish [--tag=TAG]
```

## License

By contributing to Netlify Node Client, you agree that your contributions will be licensed under its
[MIT license](LICENSE).
