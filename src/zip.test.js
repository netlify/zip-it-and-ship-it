const test = require("ava");
const { filesForFunctionZip } = require("./zip");
const tempy = require("tempy");
const path = require("path");
const promisify = require("util.promisify");
const cpx = require("cpx");
const rimraf = promisify(require("rimraf"));

test.serial("find function files with a package.json", async t => {
  const tmp = tempy.directory();
  const name = "package-json-example";
  const fixture = path.resolve(__dirname, "./fixtures", name);
  cpx.copySync(path.join(fixture, "**/*"), tmp);

  const files = filesForFunctionZip(
    path.join(tmp, "functions", "a-function.js")
  );

  t.true(files instanceof Set, "get a set back");
  t.is(files.size, 3, "Got all 3 files");

  await rimraf(tmp);
});

test.serial("find function files without a package.json", async t => {
  const tmp = tempy.directory();
  const name = "no-package-json-example";
  const fixture = path.resolve(__dirname, "./fixtures", name);
  cpx.copySync(path.join(fixture, "**/*"), tmp);

  const files = filesForFunctionZip(path.join(tmp, "functions", "a-function"));

  t.true(files instanceof Set, "get a set back");
  t.is(files.size, 2, "Got all 2 files");

  await rimraf(tmp);
});
