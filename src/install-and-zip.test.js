const test = require("ava");
const { installAndZipFunctions } = require("./install-and-zip");
const tempy = require("tempy");
const path = require("path");
const promisify = require("util.promisify");
const cpx = require("cpx");
const rimraf = promisify(require("rimraf"));
const fs = require("fs");
const access = promisify(fs.access)

test.serial("install and package nested pacakge.jsons", async t => {
  const tmp = tempy.directory();
  const tmpOut = tempy.directory();
  const name = "nested-package-json";
  const fixture = path.resolve(__dirname, "../fixtures", name);

  cpx.copySync(path.join(fixture, "**/*"), tmp);

  const results = await installAndZipFunctions(path.join(tmp, 'functions'), tmpOut, {
    logFn: t.log
  })

  await t.notThrowsAsync(access(path.join(tmp, 'functions', 'a-function', 'node_modules'), fs.constants.O_DIRECTORY), 'a-function/node_modules is a folder')
  await t.notThrowsAsync(access(path.join(tmp, 'functions', 'yarn-function', 'node_modules'), fs.constants.O_DIRECTORY), 'yarn-function/node_modules is a folder')

  t.is(results.length, 2, "Two functions were successfully installed and");

  await rimraf(tmp);
  await rimraf(tmpOut);
});
