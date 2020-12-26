---
title: '绘制 "火焰图" 总结'
date: '2020-12-24'
tags: [flame graph, canvas]
---

本文是对 TiDB Dashboard 中的一个功能的总结。

PR 链接：

- [Timeline tracing ui](https://github.com/pingcap/tidb-dashboard/pull/819)

相关联的 PR:

- [Show trace results in JSON](https://github.com/pingcap/tidb-dashboard/pull/820)
- [Integrate timeline tracing with TiKV](https://github.com/pingcap/tidb/pull/19557)

## 背景

相关文档 (对外公开)

- [SQL 全链路追踪 · TiKV 侧追踪库设计](https://docs.google.com/document/d/1pA-9-kgfhnt600qx2pKim0-0V7pat0hyNIjz1O4EvI4/edit#heading=h.3aowr942di1d)
- [SQL 全链路追踪 · 结果聚合方案讨论](https://docs.google.com/document/d/1zvp_myxUnd38xSTWmNbtW-2ltQ1ZtP_4QxWIzgiitQw/edit#heading=h.m7tyobtl5c6y)
- [SQL 全链路追踪 · TiKV 侧追踪项收集](https://docs.google.com/document/d/11WCXmfCAkVxEUjhD0LDGMTU2TJY2zZHXObEbSYFZopY/edit#heading=h.8vqlmdxg13cu)

未对外公开文档：

- [全链路追踪需求分析](https://docs.google.com/document/d/1h-dythyqMzA3GebgPv3EsQdwJp_F6dzgG-enM0jgZ6Q/edit#heading=h.mwwetimxrl55)

总的来说，是为了分析执行一条 SQL 语句在不同阶段的耗时情况，我们在 TiKV 和 TiDB 中实现了 tracing 机制，可以收集到执行一条 SQL 过程中的调用堆栈及各方法的耗时，最后我们在前端把它们像火焰图那样可视化出来，以便更方便地定位问题。

## 数据结构

(摘自 [SQL 全链路追踪 · TiKV 侧追踪库设计](https://docs.google.com/document/d/1pA-9-kgfhnt600qx2pKim0-0V7pat0hyNIjz1O4EvI4/edit#heading=h.3aowr942di1d))

> 一般来说，单个追踪（Trace）由各个 Span 构成，是一棵树或有向无环图（DAG），如下图所示
>
> ![image](https://user-images.githubusercontent.com/1284531/103121755-90ab3c00-46b8-11eb-9d06-c5ab552a4085.png)
>
> Span 的核心是其对应程序片段（Procedure）的开始时间和结束时间。程序片段之间存在调用的父子关系，因而 Span 逻辑上形成树状结构。

Span 的定义大致如下所示：

```ts
type Span = {
  span_id: number
  parent_id: number

  start_time: number
  duration: number

  event: string // 调用的方法名
}
```

## 调研 - 类似产品

类似这种能够收集 span 及把 span 之间的关系展现出来的产品有 jaeger，datadog，以及，我们最容易接触到 Chrome DevTool 中的 performance panel。

Jaeger:

![image](https://user-images.githubusercontent.com/29565014/100332293-2d23e500-300c-11eb-9463-88ed8b0a1090.png)

Datadog:

![image](https://user-images.githubusercontent.com/29565014/102563936-633d1c00-4115-11eb-8536-362db71c4c51.png)

Chrome DevTool Performance Panel:

![image](https://user-images.githubusercontent.com/1284531/103147681-b3118800-4792-11eb-99d1-af80a3843878.png)

分析：

- Jaeger
  - 有一个概览视图和一个详细视图
  - 支持的交互太少，不支持滚轮放大缩小，不支持拖拽
  - 支持选择区间
  - 一个 span 就要占据独立的一行，不能直观地反应同属于一个 parent 的兄弟 span 之间的关系
- Datadog
  - 只有详细视图，没有概览视图
  - 支持滚轮放大缩小，支持拖拽
  - 不支持选择区间
  - span 之间的关系最直观
- Chrome DevTool Performace Panel
  - 像 Jaeger 一样有概览视图和详细视图
  - 支持的交互最全，包括滚轮放大缩小，拖拽，选择区间
  - span 之间的关系直观
  - 但由于 js 的单线程，兄弟 span 之间不会重叠，跟我们的场景略有区别

综合以上，我们选择的实现：

- 有概览图和详细视图 (Jaeger / Chrome)
- 像 Datadog 那样绘制 Span (Datadog)
- 支持 Chrome DevTool 中的所有交互

几乎就是 Chrome DevTool 的交互，概览+详细视图，以及 Datadog 的 Span 绘制。

最终实现效果：

![image](https://user-images.githubusercontent.com/1284531/103059275-997c0f00-45df-11eb-885a-0dc2e3344520.png)

交互效果：

概览视图支持：滚轮放大缩小区间，拖拽区间，手动选择区间

![40](https://user-images.githubusercontent.com/1284531/103148110-3503b000-4797-11eb-8277-8e4274905d20.gif)

详细视图支持：滚轮放大缩小区间，拖拽区间，点击，Hover

![42](https://user-images.githubusercontent.com/1284531/103148112-36cd7380-4797-11eb-8b57-167a4d706e3d.gif)

## 分析 - Datadog 如何绘制 Span

同于多线程的原因，所以 span 之间的关系可以如下：

1. 子 Span 可能在父 Span 结束后才结束

   ![image](https://user-images.githubusercontent.com/1284531/103148498-451d8e80-479b-11eb-80c2-803cb6bbc320.png)

1. 子 Span 可能在父 Span 结束后才开始 (这个是怎么触发的呢？延时子线程？)

   ![image](https://user-images.githubusercontent.com/1284531/103148525-9168ce80-479b-11eb-8e11-ecd686f8cd5d.png)

1. 同属于一个 Parent 的兄弟 Span 间可能重叠

   ![image](https://user-images.githubusercontent.com/1284531/103148570-181dab80-479c-11eb-8ea4-5c9b1b6f04f8.png)

来看一下 Datadog 是如何绘制各种情况的 Span 的。

1. 兄弟 Span 间没有重叠。如下图所示，parent span 有 c1/c2/c3 三个子 span。

   ![image](https://user-images.githubusercontent.com/1284531/103148759-105f0680-479e-11eb-925d-034cef77e2fa.png)

   不需要特殊处理，只需要把子 Span 绘制在父 Span 的下一层即可。

1. 兄弟 Span 间有重叠，且 Span 没有子 Span，如下图所示，p span 有 c1/c2 两个子 span，且 c2 的结束时间大于 c1 的开始时间。

   ![image](https://user-images.githubusercontent.com/1284531/103148831-cfb3bd00-479e-11eb-9efd-89e6bc2bac89.png)

   从上图我们可以认为，c1 的绘制先于 c2，即兄弟 span 的绘制顺序是按开始时间排序的，开始时间大的 span 会更先进行绘制。(后面我们可以理解为什么要先从开始时间大的 span 绘制。)

   绘制完 c1 后，我们发现 c2 跟 c1 有重叠，为了不发生绘制上的重叠，我们只好把 c2 绘制在 c1 的下一层，而不是和 c1 同处于同一层。

   此时，c1 和父 span 之间由于隔了一层，父子关系已经不再那么直观了，为了表明 c2 的父 span 是 p，于是在 c2 和 p 之间绘制一条细线。

   而假如我们先开始绘制 c2，再开始绘制 c1，则 c1 和 p 之间的细线就会和 c2 重叠，too bad。像下面这样：

   ![image](https://user-images.githubusercontent.com/1284531/103149094-59648a00-47a1-11eb-8ec6-e08945e1faea.png)

   所以我们要先绘制开始时间大的 span。

1. 兄弟 Span 间有重叠，且 Span 还有子 Span，如下图所示，p span 有 c1/c2 两个子 span，c1 span 还有子 span，c2 的结束时间大于 c1 的开始时间。

   ![image](https://user-images.githubusercontent.com/1284531/103149260-d80df700-47a2-11eb-9047-2d199f7950cc.png)

   c2 和 p 之间的一直竖直的细线表明 c2 的父 span 是 p，所以它和 c1 是兄弟 span。

   根据前面我们得出的结论，datadog 会先绘制 c1 span，包括它的所有子 span。当绘制 c2 时，发现和 c1 重叠了，因此它要绘制在 c1 之下，不仅仅是 c1 之下，而且要在它的所有子 span 之下。另外，为了让 c2 和 c1 的子 span 做一个区分，datadog 额外还在它们之间加了一个空白层。

## 准备 - 计算属性

为了能够实现上面的绘制，我们需要计算出每个 span 所处的层级 (depth)。如果 span 之间都没有重叠的话，那么 depth 的计算很简单，从 root span 开始逐层加 1 就行了。但 span 之间有了重叠后，这个计算就复杂了。而为了检测 span 之间是否会重叠，我们需要计算每个 span 的最大结束时间。从前面我们得知，子 span 的结束时间可能会大于父 span 的结束时间，所以 span 的最大结束时间是它和它所有的子 span 的结束时间中的最大值。

而我们从 API 拿到的 span 是数组的形式，我们首先要把它们重新组织成一棵树。

综上，我们在准备阶段需要做的工作：

1. 将数组转换成树结构
1. 计算 span 的最大结束时间
1. 计算 span 的 depth
