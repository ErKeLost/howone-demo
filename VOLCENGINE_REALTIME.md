# 豆包实时沟通部署说明

“沟通”页面使用应用服务器上的 WebSocket 桥接连接豆包 Realtime。浏览器只会连接应用内的 `/api/volcengine/live`，不会获取服务端凭据。

## 需要的服务端设置

在运行应用服务器的环境中设置以下两个值：

- `VOLCENGINE_APPID`
- `VOLCENGINE_APP_ACCESS_TOKEN`

可复制 `.env.example` 的键名作为非生产环境模板。不要使用 `VITE_` 前缀；不要把这两个值放进浏览器代码、客户端配置或提交到仓库。

## 运行方式

先构建前端，再由支持 WebSocket Upgrade 的 Node/Bun 运行时启动：

```sh
bun run build
bun run start
```

`bun run start` 会提供静态应用和 `/api/volcengine/live` WebSocket 桥接。凭据缺失时，沟通页会显示“实时沟通服务尚未就绪”，其余旅行功能不受影响。
