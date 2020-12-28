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

### 将数组转成树

我们从 API 获取的是 span 的数组，比如：

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

因为 begin_unix_time_ns 是时间戳，是绝对时间，但其实在绘制的时候我们更需要的是相对时间，所以我们加上有关相对时间的属性。

在绘制的时候需要知道 span 处于哪一层，用 depth 属性来标志。

```ts
interface TraceSpan {
  span_id: number
  parent_id: number

  begin_unix_time_ns: number
  duration_ns: number

  event: string
}

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

计算相对时间，要先找出 root span，root span 的 parent_id 为 0。将所有 span 的 begin_unix_time_ns 减去 root span 的 begin_unix_time_ns 就是各个 span 的相对开始时间。

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
1. 当 span 为兄弟 span 中开始时间最大的 span 时 (即最先绘制)，它的 depth 为父 span 的 depth + 1，即 span.depth = parentSpan.depth + 1
1. 当 span 和前一个兄弟 span 不重叠时，则该 span 和前一个兄弟 span 绘制在同一层，即 span.depth = lastSpan.depth
1. 当 span (假设为 span s1) 和前一个兄弟 span (假设为 span s2) 重叠时，这种情况就复杂了。这时又要分两种情况
   1. 如果前一个兄弟 span s2 没有子 span，即它是叶子 span，这时要绘制的 span s1 可以在前一个兄弟 span s2 的下一层，即 span.depth = lastSpan.depth + 1
   1. 如果前一个兄弟 span s2 有子 span，而且它的子 span 多达数层，比如 5 层，这时要绘制的 span s1 则需要处于 span s2 的最底层的子 span 的下下层，即 span.depth = lastSpan.max_child_depth + 2

这里的难点就在于如何计算 `max_child_depth`，它其实是和 depth 相互影响的。即 depth 在某些情况下依赖 `max_child_depth` 计算得到，而 `max_child_depth` 则依赖 depth 计算得到。

我选择的算法是先由顶到底，再由底到顶。具体来说，就是先从 root span 开始，它的初始 depth 和 `max_child_depth` 都是 0，往下逐层开始计算 depth，每计算一个 span，就逐层往上，用自己最新的 depth 更新父级的 `max_child_depth`。

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
