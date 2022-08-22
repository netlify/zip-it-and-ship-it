// This is the path where layers will be present in the Lambda at runtime.
export const DEFAULT_LAYERS_BASE_PATH = '/opt/netlify/layers'

export const getLayerPaths = (basePath = DEFAULT_LAYERS_BASE_PATH, layers: string[] = []) =>
  layers.map((name) => `${basePath}/${name}`)

// Generates the bootstrap code for one or more layers. It assumes that every
// layer exports a `getHandler` function that receives a function and returns
// a new (wrapped) handler.
// The bootstrap code generated looks like:
//
//  let handler = require('./netlify/functions/func1.js')
//
//  // Layer 0
//  const { getHandler: layer0 } = require('/opt/netlify/layers/layer_1/index.cjs')
//
//  handler = { handler: layer0(handler) }
//
//  // Layer 1
//  const { getHandler: layer1 } = require('/opt/netlify/layers/layer_2/index.cjs')
//
//  handler = { handler: layer1(handler) }
//
//  module.exports = handler
export const getLayersBootstrap = (handlerSpecifier: string, layerPaths: string[]) =>
  layerPaths.map((layerPath, index) => {
    const alias = `layer${index}`
    const comment = `// Layer ${index}`
    const layerImport = `const { getHandler: ${alias} } = require('${layerPath}/index.cjs')`
    const overload = `${handlerSpecifier} = { handler: ${alias}(${handlerSpecifier}) }`

    return [comment, layerImport, '', overload, ''].join('\n')
  })
