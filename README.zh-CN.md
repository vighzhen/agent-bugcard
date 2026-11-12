# Agent Bugcard

遇到编码助手报错，又不能把包含源码和私密对话的会话贴进 issue？把本地 Claude Code 或 Codex CLI 的 JSONL 拖到文件选择器或点选打开，就能生成一张可预览的诊断卡。卡上保留第几个工具调用报错、前后做了哪类操作；不复制提示词、命令、文件路径或输出正文。

[直接试用两份虚构示例](https://vighzhen.github.io/agent-bugcard/) · [下载可离线双击的 HTML](https://github.com/vighzhen/agent-bugcard/releases/latest/download/agent-bugcard.html) · [English](README.md)

![示例：第三次调用 Shell 报错。](docs/sample.svg)

1. 在浏览器打开演示；或克隆后双击 `docs/index.html`。不需要账号或 API key。
2. 点击 **Claude Code** 或 **Codex CLI** 查看示例；也可用 **Open a local trace** 选择单个会话文件（不超过 20 MiB）。只在本机处理。
3. 取消 **Nearby tool calls** 只分享统计数；取消 **Tool categories** 隐藏调用类别。确认预览后导出 SVG 或 Markdown。
4. 把 Markdown 贴到 issue，再用自己的话补充预期行为。工具不会代发。相同的调用顺序也可能透露工作方式，请自行决定分享范围。

命令行（Node.js 18+，无需安装依赖）：

```sh
node bin/agent-bugcard.cjs examples/claude.synthetic.jsonl
node bin/agent-bugcard.cjs examples/codex.synthetic.jsonl --format svg > receipt.svg
```

**Returned** 只表示找到了响应；**Error** 只计可识别的明确失败信号；**Unpaired** 表示未找到配对结果。没有工具调用的错误推理不在识别范围内。这张卡是排查线索，不能独立复现 bug。如果卡片缺少关键字段，欢迎带**自己编的最小样例**[提 issue](https://github.com/vighzhen/agent-bugcard/issues)，不要上传真实会话。
