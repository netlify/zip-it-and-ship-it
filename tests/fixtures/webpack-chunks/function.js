const __webpack_require__ = {
  u(chunkId) {
    return { 42: "abcde" }[chunkId]
  }
}

function runEntryPoint(chunkId) {
  require("./chunks/" + __webpack_require__.u(chunkId))
}

runEntryPoint(42)
