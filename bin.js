#!/usr/bin/env node
const minimist = require("minimist");
const cliOpts = require("cliclopts");
const { installAndZipFunctions } = require(".");
const path = require("path")

const pkg = require("./package.json");

const allowedOptions = [
  {
    name: "zip-go",
    abbr: "g",
    help: "zip go binaries",
    boolean: true,
    default: false
  },
  {
    name: "skip-install",
    abbr: "s",
    help: "skip dependency install",
    boolean: true,
    default: false
  },
  {
    name: "help",
    abbr: "h",
    help: "show help",
    boolean: true
  },
  {
    name: "version",
    abbr: "v",
    help: "print the version of the program"
  }
];

const opts = cliOpts(allowedOptions);
const argv = minimist(process.argv.slice(2), opts.options());

const sourceArg = argv._[0];
const destArg = argv._[1];

if (argv.version) {
  console.log(pkg.version);
  process.exit();
}

if (argv.help || !sourceArg || !destArg) {
  console.log(
    `${pkg.name}: Zip lambda functions and their dependencies for deployment\n`
  );
  console.log(`Usage: zip-it-and-ship-it [source] [destination] {options}`);
  opts.print();
  process.exit(argv.help ? 0 : 1);
}

const source = path.resolve(process.cwd(), sourceArg)
const dest = path.resolve(process.cwd(), destArg)

installAndZipFunctions(source, dest, {
  skipGo: !argv['zip-go'],
  skipInstall: argv['skip-install'],
  logFn: console.log
}).then(functionObjs => {
  functionObjs.forEach(fnObj => console.log(`Zipped "${path.basename(fnObj.path)}" (${fnObj.runtime})`))
}).catch(err => {
  throw err
})
