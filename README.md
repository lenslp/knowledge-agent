# Knowledge Agent

基于 Next.js + LangChain.js 构建的全栈 AI Agent 应用，支持多用户认证、联网搜索、RAG 知识库检索与图片理解。

## 功能特性

- 流式对话聊天，支持 Thinking Process 展示
- Tavily 联网实时搜索
- RAG 知识库检索，支持 txt / md / pdf / docx / json
- 图片理解，支持粘贴 / 拖拽 / 点击上传（最多 4 张）
- 多轮对话历史持久化
- 知识库管理页面（上传、查看、删除、重新索引）
- 用户认证（邮箱+密码 / Google OAuth）
- 多用户数据隔离，对话和知识库按用户独立存储
- 工具调用可视化（实时显示 Agent 正在调用的工具）
- Mermaid 图表渲染、代码高亮、LaTeX 数学公式

## 技术栈

- **前端**: Next.js 16 + React + Tailwind CSS 4
- **AI**: LangChain.js + Vercel AI SDK
- **数据库**: Supabase PostgreSQL + pgvector + Prisma ORM
- **认证**: Supabase Auth
- **搜索**: Tavily Search API

## 模型支持

所有模型通过环境变量配置，支持任何 OpenAI 兼容接口。

| 用途 | 环境变量 | 示例 |
|------|---------|------|
| 主对话模型 | `MODEL_NAME` + `OPENAI_BASE_URL` | qwen-plus, gpt-4o, deepseek-chat |
| 视觉模型 | `VISION_MODEL_NAME` + `VISION_BASE_URL` | qwen-vl-plus, gpt-4o |
| 向量嵌入 | `EMBEDDING_MODEL` + `EMBEDDING_BASE_URL` | text-embedding-v3, text-embedding-3-small |

> 注意：更换向量嵌入模型时，若维度不同需重建数据库并重新上传知识库文件。

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，填入以下配置：

```env
# 主对话模型（OpenAI 兼容接口）
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
MODEL_NAME=qwen-plus

# 视觉模型（用于图片理解）
VISION_MODEL_NAME=qwen-vl-plus
VISION_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
VISION_API_KEY=your-api-key

# 向量嵌入模型（不填 BASE_URL/API_KEY 则复用主模型配置）
EMBEDDING_MODEL=text-embedding-v3
EMBEDDING_DIMENSIONS=1024

# Tavily 联网搜索
TAVILY_API_KEY=your-tavily-key

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
DATABASE_URL=postgresql://...
```

### 3. 初始化数据库

在 Supabase 中启用 pgvector 扩展后执行：

```bash
npx dotenv -e .env -- npx tsx scripts/setup-db.ts
```

### 4. 配置 Supabase Auth

- 在 Supabase 控制台开启 Email 认证
- （可选）配置 Google OAuth：Authentication → Providers → Google

### 5. 生成 Prisma Client

```bash
npx prisma generate
```

### 6. 启动开发服务器

```bash
npm run dev
```

访问 `http://localhost:3000`，注册账号后即可使用。

## 测试

### 组件测试

```bash
npm test
```

### E2E 测试

首次运行需要安装 Playwright 浏览器：

```bash
npx playwright install chromium
```

常用命令：

```bash
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:demo
```

更完整的测试分层与约定见：`docs/TESTING.md`

## 项目结构

```
app/
  api/
    chat/              # 主对话 API（Agent + Vision 分支）
    chats/             # 对话列表 CRUD
    chats/[id]/        # 单个对话详情/删除
    knowledge/         # 知识库管理 API
    knowledge/upload/  # 知识库文件上传
    knowledge/reindex/ # 知识库重新索引
  components/
    ChatInput.tsx      # 聊天输入框（文本+图片上传）
    ChatMessages.tsx   # 消息列表容器
    ChatSidebar.tsx    # 侧边栏（对话列表+新建/切换/删除）
    MessageBubble.tsx  # 单条消息气泡（Markdown渲染+图片）
    ToolCallBubble.tsx # 工具调用状态气泡
    DeleteConfirmDialog.tsx # 删除确认弹窗
    MermaidChart.tsx   # Mermaid 图表渲染组件
  login/               # 登录/注册页面
  knowledge/           # 知识库管理页面
  page.tsx             # 主聊天页面
  layout.tsx           # 根布局
  globals.css          # 全局样式
e2e/
  login.spec.ts        # 登录页浏览器端到端测试
lib/
  agent.ts             # LangChain Agent 构建（LLM + Tools + Prompt）
  chat-helpers.ts      # 消息解析、Chat 创建、消息存库
  vision.ts            # 图片理解请求处理（Vision 模型调用+流转换）
  knowledge.ts         # 文件解析、向量化、嵌入模型
  knowledge-db.ts      # 知识库数据库操作
  prisma.ts            # Prisma Client 单例
  supabase-server.ts   # 服务端 Supabase 客户端 + getCurrentUser()
  supabase-browser.ts  # 浏览器端 Supabase 单例
proxy.ts               # 路由守卫（认证拦截 / E2E 测试模式绕过）
prisma/
  schema.prisma        # 数据库模型（Chat, Message, Document, DocumentManifest）
scripts/
  setup-db.ts          # 数据库初始化脚本
tests/
  setup.ts             # Vitest 初始化
docs/
  AUTH.md              # 认证实现文档
  IMAGE_VISION.md      # 图片理解实现文档
  API_DOCS.md          # API 文档（LangChain & Vercel AI SDK 用法解析）
  TESTING.md           # 自动化测试方案
playwright.config.ts   # Playwright 配置
vitest.config.ts       # Vitest 配置
```

## 文档

- [用户认证](docs/AUTH.md)
- [图片理解](docs/IMAGE_VISION.md)
- [API 文档](docs/API_DOCS.md)
- [自动化测试方案](docs/TESTING.md)

## 路线图

- [ ] 代码执行工具（数据分析、绘图）
- [ ] MCP 工具集成（日历、邮件、数据库）
- [ ] 多轮上下文压缩
- [ ] Vercel 一键部署
- [ ] API 限流与 LangSmith 追踪
