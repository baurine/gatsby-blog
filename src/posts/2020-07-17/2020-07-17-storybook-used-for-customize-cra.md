---
title: '在 CRA 项目中使用 Storybook'
date: '2020-07-17'
tags: [storybook, cra, customize-cra]
---

最近在一个已成熟的项目中加入 storybook 作为 ui components 的 playground。以前只是拿 storybook 练习过 demo，在实际项目中使用还是第一次，遇到了一些问题，这里做一些总结汇总。

先说一下项目的情况：

1. 使用 CRA (create-react-app) 创建的 react 项目，使用 typescript 和 javascript 混合编码，并使用 react-app-rewired 和 customize-cra 对 webpack config 进行了自定义修改。
1. 大量代码放置在 src 目录以外，目录结构是这样的：

   ```
   - src
   - lib
     - components
     - utils
   ```

1. 使用了 resolve alias，比如：

   ```json
   "paths": {
     "@lib/*": ["lib/*"],
     ...
   }
   ```

按照官网上教程的默认步骤将 storybook 集成到项目中：`npx -p @storybook/cli sb init --story-format=csf-ts`，然后执行 `yarn storybook`，陆续碰到了以下问题：

1. 无法解析类似 `import {xxx} from '@lib/components'` 中的 `@lib` alias
1. 无法处理 src 目录以外的文件
1. 解决以上问题通过编译后，遇到运行时错误：`Uncaught SyntaxError: Unexpected token 'default'`

## 无法解析类似 `import {xxx} from '@lib/components'` 中的 `@lib` alias

使用 `yarn storybook --debug-webpack` 打印 storybook 使用的 webpack config，发现 resolve.alias 中确实没有 `@lib`，如下所示：

```js
  resolve: {
    extensions: [...],
    modules: [...],
    alias: {
      '@emotion/core': '/Users.../ui/node_modules/@emotion/core',
      '@emotion/styled': '/Users.../ui/node_modules/@emotion/styled',
      'emotion-theming': '/Users.../ui/node_modules/emotion-theming',
      '@storybook/addons': '/Users.../ui/node_modules/@storybook/addons',
      '@storybook/api': '/Users.../ui/node_modules/@storybook/api',
      '@storybook/channels': '/Users.../ui/node_modules/@storybook/channels',
      '@storybook/channel-postmessage': '/Users.../ui/node_modules/@storybook/channel-postmessage',
      '@storybook/components': '/Users.../ui/node_modules/@storybook/components',
      '@storybook/core-events': '/Users.../ui/node_modules/@storybook/core-events',
      '@storybook/router': '/Users.../ui/node_modules/@storybook/router',
      '@storybook/theming': '/Users.../ui/node_modules/@storybook/theming',
      '@storybook/semver': '/Users.../ui/node_modules/@storybook/semver',
      '@storybook/client-api': '/Users.../ui/node_modules/@storybook/client-api',
      '@storybook/client-logger': '/Users.../ui/node_modules/@storybook/client-logger',
      react: '/Users.../ui/node_modules/react',
      'react-dom': '/Users.../ui/node_modules/react-dom',
    },
```

在 .storybook/main.js 中修改默认的 webpack config，在 resolve.path 中加入 `@lib`。

```js
const path = require('path')

function addMoreAlias(config) {
  config.resolve.alias['@lib'] = path.resolve(__dirname, '../lib')
  return config
}

module.exports = {
  stories: ['../lib/components/**/*.stories.@(ts|tsx|js|jsx)'],
  addons: [
    '@storybook/preset-create-react-app',
    '@storybook/addon-actions',
    '@storybook/addon-links',
  ],
  webpackFinal: (config) => addMoreAlias(config),
}
```

但其实这只是一种 workaround，resolve alias 我们已经在 typescript 的 tsconfig.json 中声明过了，最根本的办法是我们应该复用 config-overrides.js 中使用的 webpack config。

```js
// ref: https://harrietryder.co.uk/blog/storybook-with-typscript-customize-cra/
const custom = require('../config-overrides')

module.exports = {
  stories: ['../lib/components/**/*.stories.@(ts|tsx|js|jsx)'],
  addons: [
    '@storybook/preset-create-react-app',
    '@storybook/addon-actions',
    '@storybook/addon-links',
  ],
  webpackFinal: (storybookConfig) => {
    const customConfig = custom(storybookConfig)
    const newConfigs = {
      ...storybookConfig,
      module: { ...storybookConfig.module, rules: customConfig.module.rules },
    }
    return newConfigs
  },
}
```

官方文档上也有相关如何复用已有的 webpack config 的内容：https://storybook.js.org/docs/configurations/custom-webpack-config/#using-your-existing-config

## 无法处理 src 目录以外的文件

通过上面复用 config-overrides 我以为可以同时解决这个问题，因为我们在 tsconfig.json 中也声明了代码路径包含在 src, lib, ... 里。如下所示：

```json
// tsconfig.json
{
  // ...
  "include": ["src", "lib"]
}
```

但编译时还是提示无法处理 src 目录以外的文件。通过 `yarn storybook --debug-webpack` 打印完整的 webpack config，发现在 include 属性中只包含了 src folder 和 .storybook folder，如下所示：

```js
test: /\.(js|mjs|jsx|ts|tsx)$/,
include: [
  '/Users.../ui/src',
  '/Users.../ui/.storybook',
],
```

于是我们只好修改 webpack config 手动把 lib 目录和其它 src 外的目录加到 include 里，完整的 main.js 如下所示：

```js
const path = require('path')

function includeMorePaths(config) {
  // find rule to handle *.tsx files
  for (const rule of config.module.rules) {
    for (const subRule of rule.oneOf || []) {
      // /\.(js|mjs|jsx|ts|tsx)$/
      if (subRule.test instanceof RegExp && subRule.test.test('.tsx')) {
        subRule.include.push(path.resolve(__dirname, '../lib'))
        // ...
        break
      }
    }
  }

  return config
}

// ref: https://harrietryder.co.uk/blog/storybook-with-typscript-customize-cra/
const custom = require('../config-overrides')

module.exports = {
  stories: ['../lib/components/**/*.stories.@(ts|tsx|js|jsx)'],
  addons: [
    '@storybook/preset-create-react-app',
    '@storybook/addon-actions',
    '@storybook/addon-links',
  ],
  webpackFinal: (storybookConfig) => {
    const customConfig = custom(storybookConfig)
    const newConfigs = {
      ...storybookConfig,
      module: { ...storybookConfig.module, rules: customConfig.module.rules },
    }
    return includeMorePaths(newConfigs)
  },
}
```

## 运行时错误：`Uncaught SyntaxError: Unexpected token 'default'`

这是由于代码的写法导致的，下面的写法会导致这个错误：

```js
export default function Foo() {
  //...
}

Foo.Bar = BarComponent
```

把它修改成：

```js
function Foo() {
  //...
}
export default Foo
Foo.Bar = BarComponent
```

参考：https://github.com/storybookjs/storybook/issues/11419#issuecomment-658969643

整个的完整过程可以参看这个 PR: https://github.com/pingcap-incubator/tidb-dashboard/pull/691
