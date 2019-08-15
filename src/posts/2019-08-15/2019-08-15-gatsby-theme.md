---
title: '对 Gtasby Theme 的理解'
date: '2019-08-15'
tags: [gatsby, gatsby theme]
---

趁着最近项目没那么紧，找了点时间把放在 todolist 上已久的 gatsby theme 看了看。把官网的 docs 完整地看了一遍，照着 tutorial 做了一遍，相关的代码和笔记放到一个单独的 repo - [build-gatsby-theme](https://github.com/baurine/build-gatsby-theme) 了。

以前通过各种 starter 来初始化一个 gatsby 项目后，这个项目从此就和 starter 脱离关系了，我们直接在 starter 源码基本上开始各种魔改，如果 starter 有了更新，我们没有办法直接方便地使用上新版本的 starter。这种设计就属于违反了设计原则中的开闭原则 - 对外扩展开放，对内修改关闭。

而 gatsby theme 通过把原来的 starter 转变成一个单独的 theme npm package，新项目不再是 starter 的 fork，而是把这个 starter 作为我们新项目的一个依赖，这样如果这个 starter 有了更新，我们直接更新一下 package.json 就行了，而且通过 shadowing 机制，我们可以在自己的项目中方便的覆写和扩展 theme 中默认的 component 和配置，而不是直接修改 theme 的代码，perfect!

所以 gatsby theme 既解决了和 starter 不能保持更新的问题，也遵守了开闭原则。

以前我感觉 gatsby 只是领先 jekyll/hugo/hexo 一小截，有了 gatsby theme (尤其是 shadowing 机制) 后，可以说是甩开它们一大截了。

结论：真香。
