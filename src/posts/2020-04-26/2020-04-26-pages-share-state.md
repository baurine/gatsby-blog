---
title: 'React 页面间保存恢复状态的几种方法总结'
date: '2020-04-26'
tags: []
---

我们经常遇到这样的场景，有两个页面，一个是列表页，一个是详情页。列表页以列表形式显示多个 item，同时提供搜索框或选项框来对结果进行过滤，点击列表中的 item 后将跳转到它的详情页。点击返回，将返回列表页，但返回列表页后，我们要保留之前选择的选项或搜索用的关键字，而不是初始状态。

因为列表页和详情页是两个独立的，平级的页面，而不是父组件与子组件的关系，所以状态无法通过 props 进行传递和回调。

那么如何实现，在从详情页回到列表页时，列表页能够恢复原来的过滤选项呢。

在一个项目中实践后总结有以下几种方法：

1. 全局 store (redux/dva)
1. React Context
1. LocalStorage
1. SessionStorage
1. 将过滤选项放置在 url 中，作为 url 的 query parameters

## 全局 Store

毫无疑问，这是最通用的方法。将过滤选项放置到全局的 redux store 中，如果你在项目中使用了 redux 的话。

(个人目前很排斥使用 redux，而我们的项目也没有使用 redux。)

## React Context

如果没有使用 redux store，那么 React Context 算是最优雅的方案了。将过滤选项保存到 context 中，context provider 放置在列表页和详情页共同的父组容器上。

但这种方案尝试下来发现，代码会比较多，而且面临在子组件中更新 context 容易引发死循环的问题。

## LocalStorage

我们还可以将列表页的过滤选项持久化到 LocalStorage 中，当列表页重新加载时，从 LocalStorage 中读出原来的过滤选项。这里存在一个问题是如何处理过滤选项过期失效。前两种方法都是保存在内存里，关掉 tab 就自动失效了。但如果持久化到 LocalStorage 后，从任意地方进入列表页，甚至是关掉 tab 后再打开，都会恢复之前的过滤选项。而大部分情况下，我们只是希望从详情页跳转回列表页时才恢复之前的过滤选项，其余时候都应该是将过滤选项重置。

一种折中的办法是，在从详情页跳转回列表页时，在 url 中加上额外的参数，比如：

```jsx
<Link to="/list?from=detail">返回列表</Link>
```

这样，在列表页加载时，检测 url 参数中是否包含 `from=detail`，包含的话就使用 local storage 中的值，否则不使用。

(window.history 出于安全考虑，不允许获取上一个 url，所以我们无法知道列表页具体是从哪个页面跳转而来。)

## SessionStorage

SessionStorage 在关闭 tab 后持久化在其中的内容将自动清除，正好能够解决将过滤选项保存在 LocalStorage 无法自动失效的问题。

虽然还有点小瑕疵，就是没有关闭 tab 时，从任意页面进行列表页都会恢复之前的过滤选项，但这也是能接受的。

配合使用 @umijs/hooks 提供的 useSessionStorageState hook，代码简洁易懂。

## 将过滤选项放置在 url 中，作为 url 的 query parameters

另一种常见的做法是将过滤选项附加到当前列表页的 url 中，这样，从详情页返回列表页时，应该直接调用 `history.goBack()`，而不是跳转到 `/list`。

这种方式适用于过滤选项比较少，只有一两项的时候，如果过滤选项多了，url 就会变得很丑。

## 总结

我们的项目因为没有使用 redux，所以第一种方法就排除了。然后尝试了 React Context，代码量较多，且因为要在子组件内更新 context，要很小心谨慎才能避免死循环；尝试了将过滤选项放置在 url 中，但由于过滤选项很多，url 很丑，遂放弃。最后在 LocalStorage 和 SessionStorage 是选择了 SessionStorage。

示例代码：https://github.com/pingcap-incubator/tidb-dashboard/blob/master/ui/lib/apps/Statement/utils/useStatement.ts#L47
