# 自动化测试方案

本文档说明当前仓库的自动化测试分层、运行方式和扩展约定。

## 测试分层

项目当前采用两层测试：

- **Vitest + React Testing Library**：用于单元测试 / 组件测试
- **Playwright**：用于真实浏览器 E2E 测试

分工建议：

- `Vitest` 负责验证组件交互、本地状态变化、错误提示、按钮 loading、函数调用参数等
- `Playwright` 负责验证真实页面流程、浏览器行为、路由跳转、端到端交互

## 当前已接入内容

### 1. 组件测试

- 配置文件：`vitest.config.ts`
- 初始化文件：`tests/setup.ts`
- 当前示例：`app/login/page.test.tsx`

当前 `Vitest` 已覆盖登录页的核心交互：

- 默认登录态与注册态切换
- 邮箱密码登录提交
- 注册成功提示
- 登录失败错误展示
- loading 时按钮禁用
- Google OAuth 调用参数

### 2. E2E 测试

- 配置文件：`playwright.config.ts`
- 当前示例：`e2e/login.spec.ts`

当前 `Playwright` 已覆盖：

- 登录失败提示
- 注册成功提示

## 运行方式

### Vitest

```bash
npm test
```

监听模式：

```bash
npm run test:watch
```

只跑登录页测试：

```bash
npx vitest run app/login/page.test.tsx
```

### Playwright

首次运行前需要安装浏览器：

```bash
npx playwright install chromium
```

后台无头运行：

```bash
npm run test:e2e
```

显式无头运行：

```bash
npm run test:e2e:headless
```

可见浏览器运行：

```bash
npm run test:e2e:headed
```

可视化测试面板：

```bash
npm run test:e2e:ui
```

慢动作演示模式：

```bash
npm run test:e2e:demo
```

`demo` 模式会：

- 打开可见浏览器
- 单 worker 顺序执行
- 使用 `PLAYWRIGHT_SLOW_MO=300` 慢放每一步操作

## 目录约定

建议遵循以下放置方式：

- 组件测试：与页面或组件同目录，命名为 `*.test.tsx`
- E2E 测试：统一放在 `e2e/` 目录，命名为 `*.spec.ts`

示例：

- `app/login/page.test.tsx`
- `e2e/login.spec.ts`

## 当前测试设计说明

### Vitest 设计

`Vitest` 使用 `jsdom` 环境模拟浏览器，不会真的打开可视化浏览器窗口。

为了让组件测试稳定且快速，登录页测试中对 `getSupabaseBrowserClient()` 做了 mock，不依赖真实 Supabase 环境。

### Playwright 设计

`Playwright` 会启动真实浏览器，并通过 `playwright.config.ts` 中的 `webServer` 自动拉起本地 Next.js 开发服务器。

当前 E2E 方案没有直接依赖真实 Supabase，而是通过以下方式隔离外部依赖：

- 在 `e2e/login.spec.ts` 中用 `page.route()` 拦截 Supabase Auth 请求
- 在 `proxy.ts` 中通过 `E2E_TEST_MODE=true` 跳过服务端鉴权代理，避免测试时被统一重定向

这意味着当前 E2E 更偏向“浏览器层集成测试”，优点是：

- 跑得更稳定
- 不依赖真实测试账号
- 不依赖远程 Supabase 状态

## 新增测试时的建议

### 适合写到 Vitest 的内容

- 表单切换
- 错误文案显示
- 按钮 loading / disabled 状态
- 回调函数参数
- 组件内部状态变化
- `lib/` 下纯函数逻辑

### 适合写到 Playwright 的内容

- 登录成功后跳转首页
- 未登录访问受保护页面时跳到 `/login`
- 已登录状态访问 `/login` 时被重定向
- 知识库页面关键上传流程
- 聊天主流程

### 暂不建议优先投入的内容

- 大量快照测试
- 纯样式细节测试
- 首批就接入真实 Google OAuth 全链路

## 编写 Playwright 用例的注意点

1. **优先使用稳定选择器**
   - 优先 `getByRole()`、`getByText()`、`getByPlaceholder()`
   - 避免依赖容易变化的样式类名

2. **涉及第三方服务时优先拦截请求**
   - 当前登录流程示例已经使用请求拦截 mock Supabase Auth

3. **避免与 Vitest 扫描范围冲突**
   - `vitest.config.ts` 已排除 `e2e/**`
   - E2E 文件统一留在 `e2e/` 目录即可

4. **先测关键路径，再扩展**
   - 先覆盖主流程
   - 再补异常分支和边界情况

## 后续可继续补充的场景

按优先级建议：

1. 邮箱密码登录成功并跳转首页
2. 未登录访问首页时跳转 `/login`
3. 已登录后访问 `/login` 被重定向
4. 聊天主流程 E2E
5. 知识库上传流程 E2E

## 相关文件

- `package.json`
- `vitest.config.ts`
- `tests/setup.ts`
- `app/login/page.test.tsx`
- `playwright.config.ts`
- `e2e/login.spec.ts`
- `proxy.ts`
