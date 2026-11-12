# Agent Bugcard

把 Claude Code 或 Codex CLI 的一次失败做成能贴进 GitHub issue 的附件。Bugcard 在本地读取一份会话文件，找出哪个工具调用报了错。你可以选择分享相邻调用、工具类别和 shell 退出码，提示词、命令、路径与输出正文都留在自己的机器上。

[**用虚构样例直接试**](https://vighzhen.github.io/agent-bugcard/) · [下载离线 HTML](https://github.com/vighzhen/agent-bugcard/releases/latest/download/agent-bugcard.html) · [English](README.md)

![虚构示例。第 3 次 Shell 调用返回 127，可以先检查命令名和 PATH。](docs/sample.svg)

示例中，第 3 次 Shell 调用返回了 127，维护者可以先问“这个命令在 agent 的 PATH 里吗？”切换到 Codex 样例，退出码变成 126，第一步就可以查文件能否执行。这些是 POSIX shell 下的排查方向，程序也能主动返回这些数值。[Bash 退出码说明](https://www.gnu.org/software/bash/manual/html_node/Exit-Status.html)

## 贴进 issue

1. 打开在线演示，或下载 HTML 后双击离线运行。内置的两份日志都是虚构的。
2. 点 **Open local JSONL** 选择一个已保存的会话，最大 20 MiB。每次打开自己的文件，退出码都默认隐藏。如果有多次失败，用 **Focus on** 选中本次要报告的调用。
3. 勾选愿意分享的字段，查看预览，点 **Copy for GitHub issue**。在 issue 里粘贴，再用一句话补上你原本期待的结果。也可以下载 SVG 或 Markdown。

Claude Code 的会话通常在 `~/.claude/projects/` 子目录下，Codex CLI 通常在 `~/.codex/sessions/年/月/日/`。Windows 从当前用户文件夹进入对应目录。如果设置了 `CLAUDE_CONFIG_DIR` 或 `CODEX_HOME`，请到自定义的根目录查找。

## 命令行

需要 Node.js 18+。在克隆下来的项目目录运行：

```sh
node bin/agent-bugcard.cjs examples/claude.synthetic.jsonl --exit-codes
node bin/agent-bugcard.cjs examples/claude.synthetic.jsonl --call 3 --exit-codes --format svg > receipt.svg
node bin/agent-bugcard.cjs path/to/session.jsonl --summary-only
```

**Error** 表示日志里有明确的工具失败信号。**Returned** 表示工具给出了响应。**Unpaired** 表示没找到对应的完成记录。遇到不认识的输出格式，工具可能无法识别失败。只分享统计或隐藏工具类别时，退出码和排查提示也会一起隐藏。

如果这张卡还缺一个能让你继续排查的字段，欢迎告诉我们你需要追问什么。报告解析问题时请使用自己编的最小样例。[提交反馈](https://github.com/vighzhen/agent-bugcard/issues)
