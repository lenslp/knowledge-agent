# 用户认证

## 技术栈

- **Supabase Auth**：负责用户身份验证，支持邮箱+密码和 Google OAuth
- **@supabase/ssr**：在 Next.js Server Component / Route Handler / Middleware 中读取 session
- **middleware.ts**：全局路由守卫，未登录跳 `/login`，已登录访问 `/login` 跳 `/`

## 登录方式

### 邮箱 + 密码

- 注册：`supabase.auth.signUp({ email, password })`，Supabase 自动发确认邮件（可在控制台关闭强制验证）
- 登录：`supabase.auth.signInWithPassword({ email, password })`
- 登录成功通过 `onAuthStateChange` 监听 session，有 session 即跳转首页

### Google OAuth

- 调用：`supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: "...", queryParams: { prompt: "select_account" } } })`
- `prompt: "select_account"` 确保每次都弹出 Google 账号选择页，方便切换账号
- Google 授权完成后回调到 Supabase，Supabase 再重定向回应用，`onAuthStateChange` 检测到 session 后自动跳转首页

## 配置步骤（Google OAuth）

1. [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials → 创建 OAuth 2.0 Client ID
   - 应用类型：Web 应用
   - 授权重定向 URI：`https://<project-ref>.supabase.co/auth/v1/callback`
2. Supabase 控制台 → Authentication → Providers → Google
   - 填入 Client ID 和 Client Secret
   - 开启开关 → Save

## 数据隔离

每个用户拥有独立的对话和知识库，通过 `user_id` 字段实现：

- `chats.user_id`：对话归属
- `documents` metadata 中的 `user_id`：向量检索时过滤
- `document_manifests.user_id`：知识库文件去重

所有 API 路由通过 `getCurrentUser()`（`lib/supabase-server.ts`）获取当前用户，未登录返回 401。

## 相关文件

| 文件 | 说明 |
|------|------|
| `app/login/page.tsx` | 登录/注册页面 |
| `middleware.ts` | 路由守卫 |
| `lib/supabase-server.ts` | 服务端 Supabase 客户端 + `getCurrentUser()` |
| `lib/supabase-browser.ts` | 浏览器端 Supabase 单例 |
