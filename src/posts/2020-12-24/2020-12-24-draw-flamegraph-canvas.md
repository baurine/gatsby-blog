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

总的来说，是为了分析执行一条 SQL 语句在不同阶段的耗时情况，我们在 TiKV 和 TiDB 中实现了 tracing 机制，可以收集到执行一条 SQL 过程中的调用堆栈及各方法的耗时，最后我们在前端把它们像火焰图那样展现，以方便定位问题。

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
  - 有概览视图和详细视图
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
- 像 Datadog 那样绘制 span (Datadog)
- 支持 Chrome DevTool 中的所有交互

几乎就是 Chrome DevTool 的交互，概览+详细视图，以及 Datadog 的 span 绘制。

最终实现效果：

![image](https://user-images.githubusercontent.com/1284531/103059275-997c0f00-45df-11eb-885a-0dc2e3344520.png)

交互效果：

概览视图支持：滚轮放大缩小区间，拖拽区间，手动选择区间

![40](https://user-images.githubusercontent.com/1284531/103148110-3503b000-4797-11eb-8277-8e4274905d20.gif)

详细视图支持：滚轮放大缩小区间，拖拽区间，点击，Hover

![42](https://user-images.githubusercontent.com/1284531/103148112-36cd7380-4797-11eb-8b57-167a4d706e3d.gif)

## 分析 - Datadog 如何绘制 span

由于多线程的原因，所以 span 之间的关系可以如下：

1. 子 span 可能在父 span 结束后才结束

   ![image](https://user-images.githubusercontent.com/1284531/103148498-451d8e80-479b-11eb-80c2-803cb6bbc320.png)

1. 子 span 可能在父 span 结束后才开始 (这个是怎么触发的呢？延时子线程？)

   ![image](https://user-images.githubusercontent.com/1284531/103148525-9168ce80-479b-11eb-8e11-ecd686f8cd5d.png)

1. 同属于一个 Parent 的兄弟 span 间可能重叠

   ![image](https://user-images.githubusercontent.com/1284531/103148570-181dab80-479c-11eb-8ea4-5c9b1b6f04f8.png)

来看一下 Datadog 是如何绘制各种情况的 span 的。

1. 兄弟 span 间没有重叠。如下图所示，parent span 有 c1/c2/c3 三个子 span。

   ![image](https://user-images.githubusercontent.com/1284531/103148759-105f0680-479e-11eb-925d-034cef77e2fa.png)

   不需要特殊处理，只需要把子 span 绘制在父 span 的下一层即可。

1. 兄弟 span 间有重叠，且 span 没有子 span，如下图所示，p span 有 c1/c2 两个子 span，且 c2 的结束时间大于 c1 的开始时间。

   ![image](https://user-images.githubusercontent.com/1284531/103148831-cfb3bd00-479e-11eb-9efd-89e6bc2bac89.png)

   从上图我们可以认为，c1 的绘制先于 c2，即兄弟 span 的绘制顺序是按开始时间排序的，开始时间大的 span 会更先进行绘制。(后面我们可以理解为什么要先从开始时间大的 span 绘制。)

   绘制完 c1 后，我们发现 c2 跟 c1 有重叠，为了不发生绘制上的重叠，我们只好把 c2 绘制在 c1 的下一层，而不是和 c1 同处于同一层。

   此时，c2 和父 span 之间由于隔了一层，父子关系已经不再那么直观了，为了表明 c2 的父 span 是 p，于是在 c2 和 p 之间绘制一条细线。

   而假如我们先开始绘制 c2，再开始绘制 c1，则 c1 和 p 之间的细线就会和 c2 重叠，这样明显视觉效果上差一点。像下面这样：

   ![image](https://user-images.githubusercontent.com/1284531/103149094-59648a00-47a1-11eb-8ec6-e08945e1faea.png)

   所以我们要先绘制开始时间大的 span。

1. 兄弟 span 间有重叠，且 span 还有子 span，如下图所示，p span 有 c1/c2 两个子 span，c1 span 还有子 span，c2 的结束时间大于 c1 的开始时间。

   ![image](https://user-images.githubusercontent.com/1284531/103149260-d80df700-47a2-11eb-9047-2d199f7950cc.png)

   c2 和 p 之间的一直竖直的细线表明 c2 的父 span 是 p，所以它和 c1 是兄弟 span。

   根据前面我们得出的结论，datadog 会先绘制 c1 span，包括它的所有子 span。当绘制 c2 时，发现和 c1 重叠了，因此它要绘制在 c1 之下，不仅仅是 c1 之下，而且要在它的所有子 span 之下。另外，为了让 c2 和 c1 的子 span 做一个区分，datadog 额外还在它们之间加了一个空白层。

## 准备 - 计算属性

为了能够实现上面的绘制，我们需要计算出每个 span 所处的层级 (depth)。如果 span 之间都没有重叠的话，那么 depth 的计算很简单，从 root span 开始逐层加 1 就行了。但 span 之间有了重叠后，这个计算就复杂了。而为了检测 span 之间是否会重叠，我们需要计算每个 span 的最大结束时间。从前面我们得知，子 span 的结束时间可能会大于父 span 的结束时间，所以 span 的最大结束时间是它和它所有的子 span 的结束时间中的最大值。

而我们从 API 拿到的 span 是数组的形式，我们首先要把它们重新组织成一棵树。

综上，我们在准备阶段需要做的工作：

1. 将数组转换成树结构
1. 计算每个 span 的最大结束时间
1. 计算每个 span 的 depth

### 将数组转成树

我们从 API 获取的是 span 的数组，比如像下面这样：

```json
{
  "trace_id": 5796316316865205225,
  "span_sets": [
    {
      "node_type": "TiKV",
      "spans": [
        {
          "span_id": 393276,
          "parent_id": 393275,
          "begin_unix_time_ns": 1607658272409814199,
          "duration_ns": 302332,
          "event": "Endpoint::parse_and_handle_unary_request"
        },
        {
          "span_id": 917515,
          "parent_id": 393278,
          "begin_unix_time_ns": 1607658272410116531,
          "duration_ns": 134483,
          "event": "RaftKv::async_snapshot"
        },
        {
          "span_id": 917516,
          "parent_id": 917515,
          "begin_unix_time_ns": 1607658272410116531,
          "duration_ns": 134483,
          "event": "LocalReader::propose_raft_command"
        },
        ...
}
```

我们首先要把数组重新组织成一棵树。我们给 span 加上 children, parent 等属性。

因为 `begin_unix_time_ns` 是时间戳，是绝对时间，但其实在绘制的时候我们更需要的是相对时间，所以我们加上有关相对时间的属性。

在绘制的时候需要知道 span 处于哪一层，用 depth 属性来标志。

```ts
// 这个类型声明是由代码生成器 (openapi-generator) 根据后端的 model 自动生成的
// 默认所有属性都是可选的 (虽然实际情况它们都是有值的)
interface TraceSpan {
  span_id?: number
  parent_id?: number

  begin_unix_time_ns?: number
  duration_ns?: number

  event?: string
}

// 这是我们自己扩展的类型声明
interface IFullSpan extends TraceSpan {
  node_type: string // 区分 span 对应的方法是在 tidb 还是 tikv 中执行的

  children: IFullSpan[]
  parent?: IFullSpan

  relative_begin_unix_time_ns: number
  relative_end_unix_time_ns: number
  max_relative_end_time_ns: number // include children span

  depth: number // which layer it should be drawed in, rootSpan is 0
  max_child_depth: number
}
```

我们先把 TraceSpan 转换成 IFullSpan：

```ts
const allSpans: IFullSpan[] = []
source.span_sets?.forEach((spanSet) => {
  spanSet.spans?.forEach((span) => {
    allSpans.push({
      ...span,

      node_type: spanSet.node_type!,
      children: [],

      relative_begin_unix_time_ns: 0,
      relative_end_unix_time_ns: 0,
      max_relative_end_time_ns: 0,
      depth: 0,
      max_child_depth: 0,
    })
  })
}
```

计算相对时间，要先找出 root span，root span 的 `parent_id` 为 0。将每个 span 的 `begin_unix_time_ns` 减去 root span 的 `begin_unix_time_ns` 就是各个 span 的相对开始时间。

```ts
const rootSpan = allSpans.find((span) => span.parent_id === 0)!
const startTime = rootSpan.begin_unix_time_ns!
allSpans.forEach((span) => {
  span.relative_begin_unix_time_ns = span.begin_unix_time_ns! - startTime
  span.relative_end_unix_time_ns =
    span.relative_begin_unix_time_ns + span.duration_ns!
  span.max_relative_end_time_ns = span.relative_end_unix_time_ns
})
```

然后开始转换，最直接的方法是使用递归，但时间复杂度是 O(n^2)。像下面这样：

```ts
function findChildren(parentSpan: IFullSpan, allSpans: IFullSpan[]) {
  parentSpan.children = allSpans.filter(
    (span) => span.parent_id === parentSpan.span_id
  )
  parentSpan.children.forEach((child) => {
    child.parent = parentSpan
    findChildren(child, allSpans)
  })
}

findChildren(rootSpan, allSpans)
```

为了提高性能，我们可以先把数组转换成 map，这样时间复杂度可以降低到 O(n)，像下面这样。同时，因为在上面我们得出结论，对某个 span 的子 span 进行绘制了，要按开始时间排序进行绘制，因为我们对每个 span 的 children 进行排序。

```ts
export type FullSpanMap = Record<string, IFullSpan>

function buildTree(allSpans: IFullSpan[]): FullSpanMap {
  // convert arr to map
  let spansObj = allSpans.reduce((accu, cur) => {
    accu[cur.span_id!] = cur
    return accu
  }, {} as FullSpanMap)

  // set children and parent
  Object.values(spansObj).forEach((span) => {
    const parent = spansObj[span.parent_id!]
    span.parent = parent
    // the root span has no parent
    if (parent) {
      parent.children.push(span)
    }
  })

  // sort children
  Object.values(spansObj).forEach((span) => {
    span.children.sort((a, b) => {
      let delta = a.relative_begin_unix_time_ns - b.relative_begin_unix_time_ns
      if (delta === 0) {
        // make the span with longer duration in the front when they have the same begin time
        // so we can draw the span with shorter duration first
        // to make them closer to the parent span
        delta = b.duration_ns! - a.duration_ns!
      }
      return delta
    })
  })
  return spansObj
}
```

### 计算 span 的最大结束时间

由上面得知，一个 span 的子 span 的结束时间可能大于该 span 自身的结束时间。

![image](https://user-images.githubusercontent.com/1284531/103148498-451d8e80-479b-11eb-80c2-803cb6bbc320.png)

在比较两个兄弟 span 之间是否会产生重叠时，我们不能只使用该 span 自身的结束时间，而是要取该 span 自身及所有后代 span 中的结束时间中的最大值。

像下面这样：

![image](https://user-images.githubusercontent.com/1284531/103200847-614f3600-4929-11eb-8f73-ce0cd9ebcf7c.png)

a span 的子 span 为 b1 和 b2，b1 的子 span 为 d1，b2 的子 span 为 c1。虽然 b2 和 b1 没有重叠，但 c1 的结束时间大于了 b1 和 d1 的结束时间，如果将 b1 和 b2 绘制在同一层级，那 c1 和 d1 会产生重叠。(但即使没有 d1，我们也不应该将 b1 和 b2 绘制在同一层级)。

因此，我们要取 span 及子代中所有结束时间中的最大值与前一个兄弟 span 的起始时间进行比较。

可以采用从顶层到底层的计算方法，从最顶层的根 span 开始，计算它的 children span 的最大结束时间，再和自己的结束时间取最大值。

```ts
function calcMaxEndTime(span: IFullSpan) {
  // return condition
  if (span.children.length === 0) {
    span.max_end_time_ns = span.end_unix_time_ns
    return span.end_unix_time_ns
  }

  const childrenTime = span.children
    .map((childSpan) => calcMaxEndTime(childSpan))
    .concat(span.end_unix_time_ns)
  const maxTime = Math.max(...childrenTime)
  span.max_end_time_ns = maxTime
  return maxTime
}

calcMaxEndTime(rootSpan)
```

也可以从底层到顶层的计算方法，从最底层的叶子 span 开始往上逐层比较。如果子 span 的结束时间大于父 span 的结束时间，就将父 span 的最大结束时间修改为子 span 的最大结束时间，否则保留不变。

```ts
function calcMaxEndTime(spansObj: FullSpanMap) {
  Object.values(spansObj)
    .filter((span) => span.children.length === 0) // find leaf spans
    .forEach(calcParentMaxEndTime)
}

// from bottom to top
function calcParentMaxEndTime(span: IFullSpan) {
  const parent = span.parent
  if (parent === undefined) return

  if (span.max_relative_end_time_ns > parent.max_relative_end_time_ns) {
    parent.max_relative_end_time_ns = span.max_relative_end_time_ns
  }
  calcParentMaxEndTime(parent)
}

calcMaxEndTime(spansObj)
```

两者的复杂度应该是差不多的 (有待计算验证)，但后者更好理解一些。

### 计算 span 的 depth

由前面总结得到 depth 的计算规则：

1. root span 绘制在第 0 层
1. 绘制同属于相同的 parent span 的兄弟 span 时，先绘制开始时间大的 span
1. 当 span 为兄弟 span 中开始时间最大的 span 时 (即最先绘制)，它的 depth 为父 span 的 depth + 1，即 `span.depth = parentSpan.depth + 1`
1. 当 span 和前一个兄弟 span 不重叠时，则该 span 和前一个兄弟 span 绘制在同一层，即 `span.depth = lastSpan.depth`，也即是 `span.depth = parentSpan.depth + 1`
1. 当 span (假设为 span s2) 和前一个兄弟 span (假设为 span s1) 重叠时，这种情况就复杂了。这时又要分两种情况
   1. 如果前一个兄弟 span s1 没有子 span，即它是叶子 span，这时要绘制的 span s2 可以在前一个兄弟 span s1 的下一层，即 `span.depth = lastSpan.depth + 1`
   1. 如果前一个兄弟 span s1 有子 span，而且它的子 span 多达数层，比如 5 层，这时要绘制的 span s2 则需要处于 span s1 的最底层的子 span 的下下层，即 `span.depth = lastSpan.max_child_depth + 2`

这里的难点就在于如何计算 `max_child_depth`，它其实是和 depth 相互影响的。即 depth 在某些情况下依赖 `max_child_depth` 计算得到，而 `max_child_depth` 则依赖 depth 计算得到。

我选择的算法是先由顶到底，再由底到顶。具体来说，就是先从 root span 开始，它的初始 depth 和 `max_child_depth` 都是 0，往下逐层开始计算 depth，每计算一个 span，就反向逐层往上，用自己最新的 depth 更新父级的 `max_child_depth`。

所以，最终实现如下所示：

```ts
// from top to bottom
function calcDepth(parentSpan: IFullSpan) {
  const childrenMaxIdx = parentSpan.children.length - 1
  // keep the same logic as datadog
  // compare the spans from right to left
  for (let i = childrenMaxIdx; i >= 0; i--) {
    const curSpan = parentSpan.children[i]

    if (i === childrenMaxIdx) {
      curSpan.depth = parentSpan.depth + 1
    } else {
      const lastSpan = parentSpan.children[i + 1]
      if (
        curSpan.max_relative_end_time_ns >
          lastSpan.relative_begin_unix_time_ns ||
        curSpan.relative_begin_unix_time_ns ===
          lastSpan.relative_begin_unix_time_ns
      ) {
        if (lastSpan.max_child_depth === lastSpan.depth) {
          // lastSpan has no children
          curSpan.depth = lastSpan.max_child_depth + 1
        } else {
          // keep the same logic as datadog
          // add a more empty layer
          curSpan.depth = lastSpan.max_child_depth + 2
        }
      } else {
        curSpan.depth = parentSpan.depth + 1
        // equal
        // curSpan.depth = lastSpan.depth
      }
    }
    curSpan.max_child_depth = curSpan.depth
    updateParentChildDepth(curSpan)
    calcDepth(curSpan)
  }
}

// from bottom to top
function updateParentChildDepth(span: IFullSpan) {
  const parent = span.parent
  if (parent === undefined) return

  if (span.max_child_depth > parent.max_child_depth) {
    parent.max_child_depth = span.max_child_depth
    updateParentChildDepth(parent)
  }
}

calcDepth(rootSpan)
```

至此，我们得到每一个 span 绘制时所处于的层级，开始时间，结束时间，就可以把这个 span 绘制出来了。剩下的就是如何绘制了。

最终的 root span:

![image](https://user-images.githubusercontent.com/1284531/103256368-06b8e700-49c8-11eb-93eb-57d4ba0ea743.png)

## 绘制 - 方案选择

绘制 2D 图形方案无非三种：SVG，Canvas，HTML DOM。

简单分析了一下 jaeger, datadog, chrome devtool 的方案选择：

1. jaeger: 概览视图用了 Canvas，概览图上的区间选择部分使用了 SVG，而详细视图使用了传统的 HTML DOM。(呃，三种全用上了，不懂，何必呢，既然都已经用上 Canvas 为啥还要用其它，有点炫技了...)
1. datadog: Canvas
1. chrome devtool: Canvas (这个是通过看源码得知的，随便找段代码 - [code snippet](https://github.com/ChromeDevTools/devtools-frontend/blob/fa0a768292e0762e82f5634f5f0b3c252922ac74/front_end/performance_monitor/PerformanceMonitor.js#L219))

SVG 适用于展示型图表，少量交互；Canvas 适用于绘制量比较大的图形，不限于图表，以及交互比较复杂的图形；这个场景中交互不算太多，但不算是图表类型；其实 SVG 也能实现，但总体来说还是 Canvas 更适合一些，也难怪三者不约而同地都选择了使用 Canvas。所以我们还犹豫啥呢，就用 Canvas 了。

接下来需要确实需不需要使用封装好的库。如果选 SVG，那毫无疑问就用 d3 了。但 Canvas 并没有像 d3 这种地位的库。鉴于我们这个场景中绘制的都是简单的直线及矩形，甚至连个圆都没有，原生 API 就足够了。当然，以及 Chrome DevTool 也是用原生 API 实现的。

方案确定好后我们就可以开始绘制了，绘制后再考虑交互操作。(不过部分绘制其实是依赖交互的...)

关于 Canvas 的绘制，推荐一本好书：[《HTML5 Canvas 核心技术》](https://book.douban.com/subject/24533314/)

## 概览图的绘制

(不涉及所有细节，只讲大概，具体细节看代码实现)

### 准备工作

在绘制之前，我们先做一些准备工作及解决一些坑。

1. 比例尺
1. blurry 问题
1. 时间转换
1. 坐标转换

#### 1. 比例尺

因为 span 里的信息是相对时间和持续时间，绘制时我们要把相对时间转换成 x 轴上的起始坐标，持续时间转换为长度，因为这里需要一个比例尺，当然，自己实现也不复杂，但如果有现成的干嘛不用呢。虽然我们没有用 svg 和 d3 来绘制，但 d3 提供了丰富的工具函数，因此我们可以使用 d3 提供的比例尺。

定义一个从时间映射到长度的比例尺。

```ts
setTimeLenScale() {
  this.timeLenScale = scaleLinear()
    .domain([0, this.timeDuration])
    .range([0, this.width])
}
```

需要从时间转换成长度时，比如：`this.timeLenScale(span.relative_begin_unix_time_ns)`。

还可以方便地从长度转换成时间，使用它的 invert() 方法，比如：

```ts
windowToTimeRange(window: Window): TimeRange {
  return {
    start: this.timeLenScale.invert(window.left),
    end: this.timeLenScale.invert(window.right),
  }
}
```

#### 2. blurry 问题

在高清屏上绘制 canvas 时，如果不作特殊处理，会发现绘制出来的内容是模糊的，像下面这样：

![image](https://user-images.githubusercontent.com/1284531/103259507-a67c7200-49d4-11eb-94ca-599a07ca7ea7.png)

再对比一下修复后的效果：

![image](https://user-images.githubusercontent.com/1284531/103259462-7af98780-49d4-11eb-8da8-6f35553096ed.png)

具体原因是因为在高清屏上，一个 css 像素实际应该要对应多个物理像素，而不再是一个物理像素。

简单的修复，让一个 css 像素对应多个物理像素。

```ts
fixPixelRatio() {
  // https://developer.mozilla.org/zh-CN/docs/Web/API/Window/devicePixelRatio
  const dpr = window.devicePixelRatio || 1

  this.context.canvas.style.width = this.width + 'px'
  this.context.canvas.style.height = this.height + 'px'
  this.context.canvas.width = this.width * dpr
  this.context.canvas.height = this.height * dpr
  this.context.scale(dpr, dpr)
}
```

相关链接：[Window.devicePixelRatio](https://developer.mozilla.org/zh-CN/docs/Web/API/Window/devicePixelRatio)

#### 3. 时间转换

span 里的各种时间默认都是以 ns 为单位的，这个数比较大，不易阅读，展现的时候我们需要转换成更易阅读的数值，比如将 "13387520 ns" 转换成 "13.39 ms"，将 "13885 ns" 转换成 "13.89 µs"。我们从 grafana 里抽取了相关的实现，使用方法如下：

```ts
import { getValueFormat } from '@baurine/grafana-value-formats'

getValueFormat('ns')(13387520, 2) // 得到 "13.39 ms"
```

#### 4. 坐标转换

在处理各种鼠标事件时，我们从鼠标 event 中拿到的坐标是相对于 window 的坐标值，但我们实际需要的是相对于 canvas 画布原点的相对坐标，因为这里要对鼠标的坐标做一个转换。

```ts
windowToCanvasLoc(windowX: number, windowY: number) {
  const canvasBox = this.context.canvas.getBoundingClientRect()
  return {
    x: windowX - canvasBox.left,
    y: windowY - canvasBox.top,
  }
}
```

### 绘制内容

![image](https://user-images.githubusercontent.com/1284531/103260341-3ff95300-49d8-11eb-8984-a6a60f66df3e.png)

由上图可以看出，需要绘制的内容大致由五部分，由先到后分别是：

1. 关键的时间间隔节点，包括时间值及一条细的竖线
1. span 的概览图
1. 区间选择区域 (实际绘制的是未选中的区域，用半透明灰色区域表示)
1. 重新用鼠标框选的新的区间，用来替换原来的区间 (半透明浅蓝色区域)
1. 一根跟随鼠标显示的竖线，用来标志鼠标当前位置，用蓝色竖线表示

(后三者的绘制依赖交互操作)

因此，定义 draw() 函数如下所示：

```ts
draw() {
  // 重绘之前先清空画布
  this.context.clearRect(0, 0, this.width, this.height)

  this.drawTimePointsAndVerticalLines()
  this.drawFlameGraph()
  this.drawWindow()
  this.drawSelectedWindow()
  this.drawMoveVerticalLine()
}
```

每一次的交互操作都会触发重绘，即调用 `this.draw()`，在 draw() 时，首先第一步是清空画布，然后再重新绘制所有内容。

#### 1. 绘制关键的时间标志线

没太多可讲的，用 fillText() 方法绘制时间值，用 lineTo() 和 stroke() 绘制竖线。更关键的地方在于如何根据画布的宽度计算合适的时间间隔。

细节先略过。

#### 2. 绘制 span 的概览图

这一部分算是核心绘制内容。

我们可以像其它部分一样，直接把所有 span 绘制在当前 canvas (我们把它称之为屏上 canvas 吧) 上。这样每一次交互，我们都会重绘，需要把所有 span 重新绘制一次。就我们这个场景而言，其实也完全可以，因为绘制量没那么大。

这里我们选择了另一种方案，我们使用了一个离屏 canvas (offscreen canvas，内存中的 canvas)。我们先在最开始的时候把所有 span 一次性地绘制到离屏 canvas 上，这个操作只会进行一次。之后，每次屏上 canvas 需要重绘 span 时，我们就把离屏 canvas 上的所有内容整体拷贝复制到屏上 canvas 上，用空间换时间。(理论上性能应该会好一些，但实际也不尽然)

> 注意：离屏 canvas 不需要处理 blurry 的问题，因为它并不在屏幕上显示。

这种方案适用于绘制内容不变化的情况，不会被交互影响。像其它几部分内容就会跟随交互而变化，就不适合用离屏 canvas。

而单个 span 在离屏 canvas 中的绘制也没太多可讲的，无非就是使用 fillRect() 填充一个矩形，当和 parent span 之间差了一个层级时，再加上一个竖线。

完整实现：

```ts
// setup
constructor(container: HTMLDivElement, flameGraph: IFlameGraph) {
  // ...

  this.drawOffscreenCanvas()
  this.draw()
  // ...
}

//////////////
// offscreen canvas
drawOffscreenCanvas() {
  this.offscreenContext.save()
  this.drawSpan(this.flameGraph.rootSpan, this.offscreenContext)
  this.offscreenContext.restore()
}

drawSpan(span: IFullSpan, ctx: CanvasRenderingContext2D) {
  if (span.node_type === 'TiDB') {
    ctx.fillStyle = '#aab254'
  } else {
    ctx.fillStyle = '#507359'
  }

  // 绘制矩形
  const x = this.timeLenScale(span.relative_begin_unix_time_ns)
  const y = span.depth * TimelineOverviewChart.OFFSCREEN_CANVAS_LAYER_HEIGHT
  let width = Math.max(
    this.timeLenScale(span.duration_ns!),
    TimelineOverviewChart.OFFSCREEN_CANVAS_SPAN_WIDTH
  )
  const height = TimelineOverviewChart.OFFSCREEN_CANVAS_LAYER_HEIGHT - 1
  ctx.fillRect(x, y, width, height)

  // 绘制竖线
  const deltaDepth = span.depth - (span.parent?.depth || 0)
  if (deltaDepth > 1) {
    ctx.strokeStyle = ctx.fillStyle
    ctx.lineWidth = 0.5
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(
      x,
      y -
        (deltaDepth - 1) * TimelineOverviewChart.OFFSCREEN_CANVAS_LAYER_HEIGHT
    )
    ctx.stroke()
  }

  // 继续绘制子 span
  span.children.forEach((s) => this.drawSpan(s, ctx))
}

// 重绘时从离屏 canvas 整体拷贝
drawFlameGraph() {
  this.context.save()
  this.context.drawImage(
    this.offscreenContext.canvas,
    0,
    0,
    this.width,
    this.offscreenCanvasHeight,
    0,
    16,
    this.width,
    this.height - 16
  )
  this.context.restore()
}
```

#### 3. 绘制区间选择区域

我们可以在概览图上选择一个区间，然后在详细视图上只展现这个区间内的 span 的情况，实现一种放大功能。区间的选择可以通过以下交互来改变：

1. 通过鼠标滚轮操作来放大缩小
1. 通过鼠标拖拽区间左右边界来分别改变左右区间
1. 通过鼠标整体拖拽区间来整体移动区间
1. 通过鼠标框选来重新设置区间

我们用 `this.curWindow` 成员变量来定义当前的选择区间，而上述交互的最终结果只是来修改 `this.curWindow`，并触发重绘。

绘制选中的区间时，我们只需要 `this.curWindow` 这个值即可。

为了凸显选中的区间，我们将未选中的区间用半透明灰色覆盖。透明度用 globalAlpha 来设置。

如下所示：

```ts
drawWindow() {
  const { left, right } = this.curWindow

  this.context.save()

  // draw unselected window area
  this.context.globalAlpha = TimelineOverviewChart.UNSELECTED_WINDOW_ALPHA
  this.context.fillStyle = TimelineOverviewChart.UNSELECTED_WINDOW_FILL_STYLE
  this.context.fillRect(0, 0, left, this.height)
  this.context.fillRect(right, 0, this.width, this.height)o

  // draw window left and right borders
  // ...

  // draw resize area
  // ...
}
```

#### 4. 绘制重新用鼠标框选的新区间

用户可以用鼠标框选新的区间，我们会在鼠标左键按下时，记录初始位置，然后随着鼠标移动，用半透明浅蓝色区域表示新的框选区间。也是一个 fillRect() 操作，用 globalAlpha 设置透明度。

```ts
drawSelectedWindow() {
  if (this.mouseDownPos === null || this.action !== Action.SelectWindow) {
    return
  }

  this.context.save()
  this.context.globalAlpha = TimelineOverviewChart.SELECTED_WINDOW_ALPHA
  this.context.fillStyle = TimelineOverviewChart.SELECTED_WINDOW_FILL_STYLE
  if (this.curMousePos.x > this.mouseDownPos.x) {
    this.context.fillRect(
      this.mouseDownPos.x,
      0,
      this.curMousePos.x - this.mouseDownPos.x,
      this.height
    )
  } else {
    this.context.fillRect(
      this.curMousePos.x,
      0,
      this.mouseDownPos.x - this.curMousePos.x,
      this.height
    )
  }
  this.context.restore()
}
```

#### 5. 绘制一根跟随鼠标显示的竖线

这根竖线用来标志鼠标当前位置，用蓝色竖线表示。在鼠标移动时记录它的坐标，然后在这个坐标处绘制这根竖线即可，用 lineTo() 和 stroke() 方法。

```ts
drawMoveVerticalLine() {
  // not draw it when mouse move outside the canvas
  // to keep same as the chrome dev tool
  if (
    this.action !== Action.SelectWindow ||
    this.mouseOutsideCanvas(this.curMousePos)
  ) {
    return
  }

  this.context.save()
  this.context.strokeStyle =
    TimelineOverviewChart.MOVED_VERTICAL_LINE_STROKE_STYLE
  this.context.lineWidth = TimelineOverviewChart.MOVED_VERTICAL_LINE_WIDTH
  this.context.beginPath()
  this.context.moveTo(this.curMousePos.x, 0)
  this.context.lineTo(this.curMousePos.x, this.height)
  this.context.stroke()
  this.context.restore()
}
```

## 概览图的交互

(其实不应该和绘制分开讲，结合在一起讲会更好；或者先讲交互)

先回顾一下效果：

![40](https://user-images.githubusercontent.com/1284531/103148110-3503b000-4797-11eb-8277-8e4274905d20.gif)

概览图支持以下交互：

1. 浏览器调整大小时修改 canvas 尺寸
1. 鼠标滚轮放大缩小选择的区间
1. 鼠标的部分拖拽和整体拖拽来修改选择的区间
1. 鼠标框选修改选择的区间
1. 鼠标移动时显示跟随的一根竖线

这些交互最终的结果都是修改相应的成员变量，触发重绘，重绘时使用新的成员变量来进行绘制。

![image](https://user-images.githubusercontent.com/1284531/103323873-c87efe80-4a7f-11eb-8bdf-42acd7d3e84d.png)

交互是通过监听各种事件，然后进行相应的处理进行实现。

```ts
/////////////////////////////////////
// setup
constructor(container: HTMLDivElement, flameGraph: IFlameGraph) {
  // ...

  this.registerHanlers()
}

/////////////////////////////////////
// event handlers: mousedown, mousemove, mouseup, mousewheel, resize
registerHanlers() {
  window.addEventListener('resize', this.onResize)
  // https://developer.mozilla.org/en-US/docs/Web/API/Element/wheel_event
  this.context.canvas.addEventListener('wheel', this.onMouseWheel)
  this.context.canvas.addEventListener('mousedown', this.onMouseDown)
  this.context.canvas.addEventListener('mousemove', this.onCanvasMouseMove)
  this.context.canvas.addEventListener('mouseout', this.onCanvasMouseOut)
  window.addEventListener('mousemove', this.onWindowMouseMove)
  window.addEventListener('mouseup', this.onMouseUp)
}
```

具体的处理逻辑看代码吧。(如果有人反馈哪个地方需要特别讲一下我再加上)

一些事件监听是绑在 canvas 上，一些则绑定在 window 上。比如 mousemove 就同时绑定在 canvas 和 window 上，因为当拖拽时，即使鼠标移到到了 canvas 外面，这个事件也要继续响应；而如果鼠标没有按下进行移动时，我们则不关心在 canvas 之外的移动。

鼠标滚轮事件监听的是 "wheel" 而不是 "mousewheel"，这样可以处理 Chrome 和 Firefox 的兼容性问题。

当鼠标放置在不同的位置上时会触发不同的动作，这个是通过简单的比较坐标实现的。Canvas 提供了一个 API `context.isPointInPath(x,y)` 来判断某个坐标是否在当前 path 中，对于复杂的图形可以用这个 API，我们这里都是很简单的图形，直接手工判断就行。

```ts
updateAction(loc: Pos) {
  // only change it when mouse isn't down
  if (this.mouseDownPos) return

  const { left, right } = this.curWindow
  if (this.mouseOutsideCanvas(loc)) {
    this.action = Action.None
  } else if (loc.y > this.dragAreaHeight) {
    this.action = Action.SelectWindow
  } else if (
    loc.x > left - TimelineOverviewChart.WINDOW_RESIZE_LINE_WIDTH_HALF &&
    loc.x < left + TimelineOverviewChart.WINDOW_RESIZE_LINE_WIDTH_HALF
  ) {
    this.action = Action.MoveWindowLeft
  } else if (
    loc.x > right - TimelineOverviewChart.WINDOW_RESIZE_LINE_WIDTH_HALF &&
    loc.x < right + TimelineOverviewChart.WINDOW_RESIZE_LINE_WIDTH_HALF
  ) {
    this.action = Action.MoveWindowRight
  } else {
    this.action = Action.MoveWindow
  }
  this.updateCursor()
}
```

至此，概览图的功能就基本完成了。

## 详细视图的交互和绘制

### 交互

先回顾一下效果：

![42](https://user-images.githubusercontent.com/1284531/103148112-36cd7380-4797-11eb-8b57-167a4d706e3d.gif)

详细视图用来放大显示概览图中选中的区间。

支持的交互：

1. 鼠标滚轮控制展示区间的放大缩小
1. 鼠标拖拽移动展示区间
1. 点击 span
1. hover span 显示 tooltip

鼠标滚轮和拖拽的处理逻辑和概览图是一样的。

点击 span 和 hover span 显示 tooltip 的核心在鼠标点击或移动时判断当前坐标是否落在某个 span 中。前面说了我们可以使用 `context.isPointInPath(x,y)` 这个 API，但也可以手工比较，这里我们就直接手工比较了。

我们遍历所有 span，返回第一个包含当前坐标的 span。

```ts
getSpanInPos(span: IFullSpan, pos: Pos): IFullSpan | null {
  const { x, y } = pos
  const x1 = this.timeLenScale(span.relative_begin_unix_time_ns)
  let x2 = this.timeLenScale(span.relative_end_unix_time_ns)
  if (x2 === x1) {
    x2 = x1 + TimelineDetailChart.MIN_SPAN_WIDTH
  }

  const y1 = span.depth * TimelineDetailChart.LAYER_HEIGHT
  const y2 = y1 + TimelineDetailChart.LAYER_HEIGHT - 1
  if (x <= x2 && x >= x1 && y <= y2 && y >= y1) {
    return span
  }
  if (span.children.length === 0) {
    return null
  }

  // traverse children
  for (let i = 0; i < span.children.length; i++) {
    const targetSpan = this.getSpanInPos(span.children[i], pos)
    if (targetSpan) {
      return targetSpan
    }
  }
  return null
}
```

然后在鼠标移动事件中，找到 hover 的 span，在坐标附近显示 tooltip。重绘时，如果 span 是 hover 的那个 span，则用不同的颜色加以区分。

```ts
onCanvasMouseMove = (event) => {
  //...

  const loc = this.windowToCanvasLoc(event.clientX, event.clientY)
  this.hoverSpan = this.getSpanInPos(this.flameGraph.rootSpan, loc)
  this.showTooltip({ x: event.clientX, y: event.clientY })
  this.draw()
}
```

同理，在鼠标点击事件中，找到点击的 span，并触发重绘，重绘时在点击的 span 边框上绘制不同的颜色加以区分。

鼠标点击事件的判断实际是在 mouseup 事件中，如果弹起时的坐标和按下时的坐标一样，则判断为点击事件。

```ts
onMouseUp = (event) => {
  //...
  const loc = this.windowToCanvasLoc(event.clientX, event.clientY)

  // handle click
  if (loc.x === this.mouseDownPos?.x && loc.y === this.mouseDownPos?.y) {
    this.clickedSpan = this.getSpanInPos(this.flameGraph.rootSpan, loc)
    //...
  }

  // release mouse
  this.mouseDownPos = null
  this.draw()
}
```

### 绘制

在详细视图中需要绘制的内容：

1. 选中的区间范围内的 span
1. 在 span 上显示文字，包括 span 的 event 和 duration time
1. 为点击的 span 显示额外的边框
1. 为 hover 的 span 显示 tooltip

详细视图中的 span 跟交互重相关，每次交互都可能改变绘制的内容，所以无法使用离屏 canvas。

因为 tooltip 是用 HTML DOM 实现的，只需要在鼠标移动时主动调用，因此我们的 draw() 函数定义如下：

```ts
draw() {
  this.context.clearRect(0, 0, this.width, this.height)

  this.drawFlameGraph() // 包括了显示文字的操作
  this.drawClickedSpan()
}
```

#### tooltip

先说 tooltip 吧。

一般来说，tooltip 用 HTML DOM 绘制会更方便和灵活，所以 tooltip 就不用 canvas 来绘制。

tooltip 用一个 fixed 定位的 div，初始透明度为 0。当有 span hover 时，将透明度设为 1.0，并用 translate() 将它的坐标移到鼠标坐标附近。

```ts
showTooltip(windowPos: Pos) {
  if (this.tooltipDomElement === null) return

  if (this.hoverSpan === null) {
    this.tooltipDomElement.style.opacity = '0.0'
  } else {
    this.tooltipDomElement.style.opacity = '1.0'
    this.tooltipDomElement.style.transform = `translate(${
      windowPos.x + 8
    }px, ${windowPos.y + 8}px)`
    this.tooltipDomElement.innerHTML = `<span>${getValueFormat('ns')(
      this.hoverSpan.duration_ns!,
      2
    )}</span>&nbsp;&nbsp;${this.hoverSpan.event!}`
  }
}
```

#### span 的绘制

绘制方法和概览图是一样的，稍有不同的地方：

1. 只绘制落在选择区间内 span
1. hover 的 span 要用不同的样式区分，这里实际用了不同的透明度为区分。
1. 要为 span 绘制文字

在绘制文字时，我们还要根据 span 的绘制宽度还选择是显示所有文字内容，还是对它进行 truncate，只显示部分，亦或是完全不显示，只能通过 hover 或点击还获知它的信息。

Canvas 提供了 `context.measureText(text)` 来估算文字的大致长度。

完整的实现：

```ts
drawFlameGraph() {
  this.context.save()
  this.drawSpan(this.flameGraph.rootSpan)
  this.context.restore()
}

drawSpan(span: IFullSpan) {
  const { start, end } = this.selectedTimeRange
  const inside =
    span.relative_end_unix_time_ns > start ||
    span.relative_begin_unix_time_ns < end

  // 只绘制区间范围内的 span
  if (inside) {
    // 对 hover 的 span 使用不同的透明度
    if (span === this.hoverSpan) {
      this.context.globalAlpha = 1.0
    } else {
      this.context.globalAlpha = 0.9
    }
    if (span.node_type === 'TiDB') {
      this.context.fillStyle = '#aab254'
    } else {
      this.context.fillStyle = '#507359'
    }
    // 计算 x, y, width, height
    let x = this.timeLenScale(span.relative_begin_unix_time_ns)
    if (x < 0) {
      x = 0
    }
    const y = span.depth * 20
    let width = Math.max(
      this.timeLenScale(span.relative_end_unix_time_ns) - x,
      TimelineDetailChart.MIN_SPAN_WIDTH
    )
    if (x + width > this.width) {
      width = this.width - x
    }
    const height = TimelineDetailChart.LAYER_HEIGHT - 1
    // 绘制矩形
    this.context.fillRect(x, y, width, height)

    // 绘制和父 span 之间的竖线
    const deltaDepth = span.depth - (span.parent?.depth || 0)
    if (deltaDepth > 1) {
      this.context.strokeStyle = this.context.fillStyle
      this.context.lineWidth = 0.5
      this.context.beginPath()
      this.context.moveTo(x, y)
      this.context.lineTo(
        x,
        y - (deltaDepth - 1) * TimelineDetailChart.LAYER_HEIGHT
      )
      this.context.stroke()
    }

    // 绘制文字
    const durationStr = getValueFormat('ns')(span.duration_ns!, 2)
    const fullStr = `${span.event!} ${durationStr}`
    const fullStrWidth = this.context.measureText(fullStr).width
    const eventStrWidth = this.context.measureText(span.event!).width
    const singleCharWidth = this.context.measureText('n').width
    this.context.textAlign = 'start'
    this.context.textBaseline = 'middle'
    this.context.fillStyle = 'white'
    this.context.globalAlpha = 1.0
    if (width >= fullStrWidth + 4) {
      // 显示完整的信息，在左边显示 event，右边显示时间
      this.context.fillText(span.event!, x + 2, y + 10)
      this.context.textAlign = 'end'
      this.context.fillText(durationStr, x + width - 2, y + 10)
    } else if (width >= eventStrWidth + 2) {
      // 只显示 event
      this.context.fillText(span.event!, x + 2, y + 10)
    } else {
      // truncate event
      const charCount = Math.floor((width - 10) / singleCharWidth)
      if (charCount > 1) {
        const str = `${span.event!.slice(0, charCount)}...`
        this.context.fillText(str, x + 2, y + 10)
      }
    }
  }

  span.children.forEach((s) => this.drawSpan(s))
}
```

#### 绘制点击的 span

在点击的 span 边框显示额外的颜色加以区分。使用 strokeRect() 方法，具体实现略。

## 概览视图和详细视图的联动

即在概览图中修改选择区间时，同时会修改详细视图的区间，反之亦然。实现方法是相互注册监听器。

```ts
function setupCharts(flameGraph: IFlameGraph) {
  //...

  if (overviewChartRef.current) {
    overviewChart.current = new TimelineOverviewChart(
      overviewChartRef.current!,
      flameGraph!
    )
    overviewChart.current.addTimeRangeListener((newTimeRange) => {
      detailChart.current?.setTimeRange(newTimeRange)
    })
  }
  if (detailChartRef.current) {
    detailChart.current = new TimelineDetailChart(
      detailChartRef.current!,
      flameGraph
    )
    detailChart.current.addTimeRangeListener((newTimeRange) => {
      overviewChart.current?.setTimeRange(newTimeRange)
    })
    //...
  }
}
```
