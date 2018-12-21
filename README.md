# Zip It and Ship It

This module handles zipping up lambda functions with their dependencies before deployment.

The main usage is:

```
const {zipFunctions} = require("zip-it-and-ship-it);

zipFunctions("functions", "functions-dist")
```

This will take all functions in the `functions` folder and create a matching `.zip` file in the `functions-dist` folder.

Each function can either be a single `.js` file that exports a `handler` or a folder with a `.js` with the same name as the folder exporting a handler.

The packaging tool will look for the `package.json` closest to the handler and use that for dependency resolution. Make sure you've run `npm install` or `yarn` for each `package.json` before using `zip-it-and-ship-it`.

Ie, the following combinations would all work:

```
/functions/foo.js
/package.json
/node_modules/
```

```
/functions/foo.js
/functions/bar/bar.js
/functions/package.json
/functions/node_modules/
```

```
/functions/foo.js
/functions/bar/bar.js
/functions/bar/package.json
/functions/bar/node_modules
/package.json
/node_modules/
```

Zip It and Ship It will only include dependencies in each zip file that's been required from the relevant handler file.
