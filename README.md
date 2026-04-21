# Interview Transcript Organizer

一个本地运行的面试录音转写整理工具。粘贴面试转写稿后，它会调用 DeepSeek，把内容整理成适合复盘、打印和导出的结构化报告。

## 功能

- 第一页：面试官问题整合
- 后续页面：每页多个 Q/A，按 Q1、Q2 连续编号
- 每个问题包含：面试官问题、候选人回答概括、必要时的修改建议
- 保留面试官问题的关键前提，避免把长铺垫压缩成失真的短标题
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

把 `.env` 里的 `DEEPSEEK_API_KEY` 改成你的 DeepSeek API key，然后运行：

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
DEEPSEEK_API_KEY=your-deepseek-api-key
DEEPSEEK_MODEL=deepseek-chat
PORT=8787
```

## 安全说明

- 不要把真实 `.env` 提交到仓库。
- `.env.example` 只保留占位值。
- 服务端会代理 DeepSeek 请求，避免把环境变量里的 API key 暴露到前端代码中。

## License

MIT
