# Agent Demo

基于 Next.js + LangChain.js 构建的全栈 AI Agent 应用，支持联网搜索与 RAG 知识库检索。

## 技术栈

- **前端**: Next.js 16 + React + Tailwind CSS 4
- **后端**: LangChain.js + Vercel AI SDK
- **大模型**: MiniMax M2.5（OpenAI 兼容接口）
- **向量化**: MiniMax embo-01（1536 维）
- **数据库**: Supabase PostgreSQL + pgvector + Prisma ORM
- **搜索**: Tavily Search API

## 已实现功能

- [x] 流式对话聊天（支持 Thinking Process 展示）
- [x] Tavily 联网实时搜索
- [x] RAG 知识库检索（支持 txt / md / pdf / docx / json）
- [x] 多轮对话历史持久化（Supabase + Prisma）
- [x] 对话列表侧边栏管理

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量（参考 .env.example）
cp .env.example .env

# 3. 初始化数据库
npx prisma db push
npx tsx scripts/setup-db.ts

# 4. 灌入知识库（将文件放入 knowledge/ 目录后执行）
npx tsx scripts/ingest.ts

# 5. 启动开发服务器
npm run dev
```

## 功能路线图（按优先级排序）

### P0 - 核心体验优化
- [x] **消息引用来源**：RAG 回答时标注文档出处（如"来源：xxx.pdf 第3页"），增强可信度
- [x] **流式工具调用展示**：实时显示 Agent 当前正在调用的工具（🔍 搜索中 / 📚 检索知识库中）
- [x] **Markdown 渲染增强**：支持代码语法高亮、表格渲染、LaTeX 数学公式

### P1 - 知识库管理
- [ ] **前端文件上传**：界面添加拖拽上传按钮，自动触发向量化入库，免去命令行操作
- [ ] **知识库管理页面**：查看已入库文档列表，支持删除 / 更新 / 重新索引
- [ ] **增量更新**：通过文件哈希检查避免重复入库，只处理新增或修改的文件

### P2 - Agent 能力扩展
- [ ] **图片理解**：接入多模态模型，支持用户上传图片提问
- [ ] **代码执行工具**：让 Agent 可以编写并执行代码（数据分析、绘图等）
- [ ] **分库管理**：支持创建多个知识库（如「HR 政策」「技术文档」），按主题分类检索
- [ ] **MCP 工具集成**：接入日历、邮件、数据库查询等外部 MCP 服务

### P3 - 生产化部署
- [ ] **用户认证**：接入 Supabase Auth，不同用户拥有独立的对话和知识库
- [ ] **Vercel 部署**：一键部署到 Vercel，公网可访问
- [ ] **多轮上下文压缩**：对超长对话做摘要压缩，避免 token 溢出
- [ ] **API 限流与监控**：防滥用限频 + 接入 LangSmith 追踪推理链路
- [ ] **定时知识更新**：定期抓取指定网页内容，自动更新知识库
