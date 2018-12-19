# Zip It and Ship It

This module handles zipping up lambda functions with their dependencies before deployment.

The main usage is:

```
const {zipFunctions} = require("zip-it-and-ship-it);

zipFunctions("functions", ({file, zip}) => {
  zip.writeZip(path.join("functions-dist", file))
})
```

This will take all functions in the `functions` folder and create a matching `.zip` file in the `functions-dist` folder.

Each function can either be a single `.js` file that exports a `handler` or a folder with a `.js` with the same name as the folder exporting a handler.

The packaging tool will look for the `package.json` closest to the handler and use that for dependency resolution. Make sure you've run `npm install` or `yarn` for each `package.json` before using `zip-it-and-ship-it`.
