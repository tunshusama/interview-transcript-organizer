# Interview Transcript Organizer

一个本地运行的面试复盘工具。粘贴面试录音转写稿后，它会把面试官问题、你的回答、回答缺口和改进建议整理成清晰的复盘报告，方便你定位下一次面试该怎么答得更好。

默认配置使用 DeepSeek 的 OpenAI-compatible Chat Completions API，但你可以换成任何兼容接口的 LLM 服务，例如 OpenAI、DeepSeek、Moonshot、通义千问兼容接口或自部署模型网关。

## 面试复盘能力

- 第一页：面试官问题整合
- 后续页面：每页多个 Q/A，按 Q1、Q2 连续编号
- 每个问题包含：面试官问题、你的回答概括、必要时的「答得不好的点以及如何修改」
- 保留面试官问题的关键前提，避免把长铺垫压缩成失真的短标题
- 识别漏掉核心考点的回答，例如商业化题没讲成本、利润、付费意愿和 ROI
- 针对 SEO、A/B 测试、增长实验、用户激活等面试场景给出更严格的复盘判断
- 对明显转写错字、口癖和断句做轻度清洗
- 对邮箱、链接、手机号、密钥等敏感信息做基础脱敏
- 支持复制 Markdown、下载 Markdown、浏览器打印/另存 PDF

## 启动

需要 Node.js 20 或更高版本。

```bash
git clone https://github.com/tunshusama/interview-transcript-organizer.git
cd interview-transcript-organizer
cp .env.example .env
```

把 `.env` 里的 `LLM_API_KEY`、`LLM_API_URL` 和 `LLM_MODEL` 改成你想使用的模型服务，然后运行：

```bash
npm start
```

打开：

```text
http://localhost:8787
```

也可以不写 `.env`，在页面右上角临时填写 API key。页面填写的 key 只保存在当前浏览器的 localStorage。

## 配置

```bash
LLM_API_KEY=your-llm-api-key
LLM_API_URL=https://api.deepseek.com/chat/completions
LLM_MODEL=deepseek-chat
PORT=8787
```

`LLM_API_URL` 需要是 OpenAI-compatible 的 `/chat/completions` 接口。页面右上角也可以临时填写 API URL、Model 和 Key。

## 安全说明

- 不要把真实 `.env` 提交到仓库。
- `.env.example` 只保留占位值。
- 服务端会代理 LLM 请求，避免把环境变量里的 API key 暴露到前端代码中。

## License

MIT
