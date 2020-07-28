---
title: '对 iframe 中的网页实现免登录且隐藏 token'
date: '2020-06-08'
tags: [iframe, postMessage]
---

场景：网页 A 中需要以 iframe 形式嵌入另一个网站 B (两个网站都自己控制，可以修改代码)，但这个嵌入的网站有用户系统，它单独运行时需要且必须登录获取 token 才能进行后续一系列操作。外部网页 A 可以通过 API 拿到这个 token。我们希望 A 嵌入 B 时可以让 B 实现自动登录而无须用户手工操作 (即手工填入用户名密码的操作)。那 A 要如何把 token 传给 B 且尽量不显式地暴露这个 token 呢。

一般情况下，我们会这么做，A 拿到 token 后，将其作为 B 网站 url 的参数，比如 `bsite.com?access_token=xxx`，赋值给 iframe 的 src 属性。这样，iframe 中的 B 网站就可以绕过手工登录操作。但这样做有两个问题：

1. 用户在浏览器里通过 inspect 查看 iframe element，可以直接看到 src 的值，即 `bsite.com?access_token=xxx`，这样 token 就直接暴露了。
1. 用户拿到这个 url 后，在新的 tab 里直接访问 b，发现也可以绕开登录，而这是不希望 b 独立访问时可以绕开登录过程。

所以我们要通过另一种方法，来把 token 从 A 传递给 iframe。可以使用 postMessage() API。postMessage 可以用来在主窗口和 iframe 之前相互发送消息。

我们可以在 B 网站增加一个空白的 portal 页面 (或者加些 loading 效果)，这个页面仅用来等待从主窗口发送 token，接收到 token 后，可以把 token 保存到内存中，然后再跳转到真正所需要的页面。

示列代码：

```js
// B 网站
if (routing.isPortalPage()) {
  // the portal page is only used to receive options
  window.addEventListener(
    'message',
    (event) => {
      const { token, lang, hideNav, redirectPath } = event.data
      auth.setAuthToken(token)
      saveAppOptions({ hideNav, lang })
      window.location.hash = `#${redirectPath}`
      window.location.reload()
    },
    { once: true }
  )
} else {
  main()
}
```

```html
<!--A 网站 -->
<html>
  <head>
    <script>
      window.onload = function () {
        const dashboard = document.getElementById('dashboard')
        const token = 'b_token'
        dashboard.contentWindow.postMessage(
          {
            token,
            lang: 'en',
            hideNav: true,
            redirectPath: '/statement',
          },
          '*'
        )
      }
    </script>
  </head>

  <body>
    <iframe
      id="dashboard"
      width="100%"
      height="100%"
      src="http://localhost:3001/dashboard/#/portal"
    ></iframe>
  </body>
</html>
```

相关 PR:

- https://github.com/pingcap-incubator/tidb-dashboard/pull/607
- https://github.com/pingcap-incubator/tidb-dashboard/pull/628
