---
title: 'react-app-rewired 和 customized-cra'
date: '2020-05-02'
tags: [react-app-rewired, customized-cra]
---

因为 create-react-app 将 webpack 的配置隐藏起来了，你没办法直接修改这个 webpack config，除非执行 `yarn run eject` 将原始的 webpack config 暴露出来，但这样就没办法再用 react-scripts 的其它命令了。

react-app-rewired 提供了一种新的选择，可以在 config-overrides.js 这个文件中修改 webpack config。

```js
/* config-overrides.js */
module.exports = function override(config, env) {
  // 参数中的 config 就是默认的 webpack config
  // 可以用 console.log(config) 查看它的完整内容
  // 可以对 config 进行任意修改 (但不见得一定会真正生效)
  // 比如：

  // 加速 rebuild 速度
  config.mode = 'development'
  config.devtool = 'eval-cheap-module-source-map'
  delete config.optimization

  // 修改 publicPath 和输出路径
  config.output.publicPath = pkg.homepage
  // 输出到 build 目录而不是默认的 dist 目录
  config.output.path = paths.appBuild

  // 最后一定要把新的 config 返回
  return config
}
```

config-overriders.js 导出的是一个函数，这个函数的签名是 `const override = (oldWebpackConfig, env) => newWebpackConfig`。(不过 oldWepbackConfig 和 newWebpackConfig 实际指向同一个对象，因为直接在原来的 webpack config 对象上进行修改)

编译时，react-app-rewired 会先取到 create-react-app 生成的默认的 webpack config，然后调用 `override(cnofig)` 方法，对 config 进行修改，得到新的 webpack config。webpack 最终会使用这个新的 config 进行打包。

react-app-rewired 原生写法，将对 webpack config 的修改全部写在 `override()` 一个方法中，不够模块化，customized-cra 则将它变得更模块化，它提供了一些 helper 方法，可以将每一个独立的修改放到单独的函数中，再串行执行这些函数。

示例：

```js
const {
  override,
  addDecoratorsLegacy,
  disableEsLint,
  addBundleVisualizer,
  addWebpackAlias,
} = require('customize-cra')
const path = require('path')

module.exports = override(
  // enable legacy decorators babel plugin
  addDecoratorsLegacy(),

  // disable eslint in webpack
  disableEsLint(),

  // add webpack bundle visualizer if BUNDLE_VISUALIZE flag is enabled
  process.env.BUNDLE_VISUALIZE == 1 && addBundleVisualizer()

  // add an alias for "ag-grid-react" imports
  addWebpackAlias({
    ['@lib']: path.resolve(__dirname, 'src/lib/*'),
  }),

  // ...
)
```

新的 override() 方法，它是一个高阶函数，它接受可变数量个参数，每个参数都是签名为 `const fn = (oldConfig) => newConfig` 的函数。它会返回一个新的函数，这个函数的签名也是 `const fn = (oldConfig) => newConfig`。

它会在内部依次调用这些参数函数，把前一个函数返回的 newConfig 作为参数调用后一个函数，得到最终的 webpack config。

大致实现应该是这样的：

```js
function override(fns) {
  return function (oriConfig) {
    let finalConfig = oriConfig
    for (const fn of fns) {
      finalConfig = fn(finalConfig)
    }
    return finalConfig
  }
}
```

由上得知，addWebpackAlias() 得到是一个函数，那 addWebpackAlias 自身应该是一个高阶函数。它接受一些选项参数，然后返回 `(config) => config` 签名的函数。

下面是 addWebpackAlias 方法的原型：

```js
export const addWebpackAlias = (alias) => (config) => {
  if (!config.resolve) {
    config.resolve = {}
  }
  if (!config.resolve.alias) {
    config.resolve.alias = {}
  }
  Object.assign(config.resolve.alias, alias)
  return config
}
```

我们可以自定义一个 log 函数放到 override() 中，观察最终 webpack config 会长成啥样：

```js
const logConfig = () => (config) => {
  console.log(config)
}

module.exports = override(
  ...,
  logConfig()
)
```

当然，由于 logConfig 方法不带参数，上面的代码也可以简化成：

```js
const logConfig = (config) => {
  console.log(config)
}

module.exports = override(
  ...,
  logConfig
)
```

如果同时还要修改 webpackDevServer 的 config，则 config-overrides.js 要这样写：

```js
const {
  override,
  disableEsLint,
  overrideDevServer,
  watchAll,
} = require('customize-cra')

module.exports = {
  webpack: override(
    // usual webpack plugin
    disableEsLint()
  ),
  devServer: overrideDevServer(
    // dev server plugin
    watchAll()
  ),
}
```

参考：

- [react-app-rewired](https://github.com/timarney/react-app-rewired)
- [customized-cra](https://github.com/arackaf/customize-cra)
