# Agent Bugcard

**Report where a coding agent failed without sharing the conversation.** Open a Claude Code or Codex CLI JSONL file on your machine. Bugcard makes a small Markdown or SVG receipt showing the first reported tool error and nearby calls. No account, install, upload, or API key.

[**Try the interactive demo →**](https://vighzhen.github.io/agent-bugcard/) · [Download the offline HTML](https://github.com/vighzhen/agent-bugcard/releases/latest/download/agent-bugcard.html) · [中文说明](README.zh-CN.md)

![Synthetic example: Read and Edit returned, the third call (Shell) reported an error, then Edit and Shell returned.](docs/sample.svg)

The example above lets a maintainer ask “What did the third tool call report?” without you handing over the entire session. **Returned** only means a response exists. Bugcard cannot infer whether the agent solved the task.

## Try it in 30 seconds

1. Open the demo above, or download the HTML and double-click it offline. The two built-in examples are synthetic.
2. Select a sample or open **one** saved session JSONL file (up to 20 MiB). The browser reads only the file you choose.
3. Turn off nearby calls for a counts-only card, or hide tool categories. Review the preview and save SVG or Markdown. Paste the Markdown into your issue and add what you expected in your own words.

After cloning, you can also open [docs/index.html](docs/index.html) from disk. The page is self-contained and disables network connections with a content security policy. The GitHub link is an ordinary outbound link. There is no telemetry.

## CLI

Requires Node.js 18+. No third-party dependencies and no install step. From the repository root:

```sh
node bin/agent-bugcard.cjs examples/claude.synthetic.jsonl
node bin/agent-bugcard.cjs examples/codex.synthetic.jsonl --format svg > receipt.svg
node bin/agent-bugcard.cjs path/to/one-session.jsonl --summary-only > receipt.md
```

## What gets shared

| On the receipt | Never copied into the receipt |
| --- | --- |
| Agent format, recognized call/error/unpaired counts | Prompts, model replies, source code, filenames, repository names |
| Optional: up to five call positions, broad tool categories, and outcomes | Tool arguments, output text, custom tool names, IDs, timestamps, environment data |
| Counts of malformed lines or orphan results, when applicable | The malformed lines, raw JSON, or error messages |

Unknown tool names collapse to **Other**. The tool joins call IDs in memory, then discards them. It does not attempt to redact and republish a transcript. The counts and sequence can still identify a distinctive workflow. Review your card before sharing.

## What counts as an error?

- **Claude Code:** matches `assistant.message.content[].tool_use` to `user.message.content[].tool_result` by ID and checks `is_error: true`. See the [upstream content-block types](https://github.com/anthropics/claude-agent-sdk-python/blob/main/src/claude_agent_sdk/types.py).
- **Codex CLI:** matches `response_item` function/custom tool calls to their outputs by `call_id`. For shell calls it recognizes numeric exit codes in legacy `exec_command_end` events and the supported unified-exec header. See the [upstream response-item definitions](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/models.rs) and [shell result header](https://github.com/openai/codex/blob/main/codex-rs/core/src/tools/context.rs).
- **Unpaired** means no matching result was found. **Returned** does not certify success; unsupported headers and opaque outputs may hide failures. This does not diagnose root cause, detect model-only mistakes, or reproduce a bug by itself. Unrecognized record types are ignored. Use one session per file; do not concatenate unidentified sessions.

## Contribute a failing format

Did Bugcard miss a call? Open an [issue](https://github.com/vighzhen/agent-bugcard/issues) with the tool version, expected count, and a tiny **invented** example. Please do not attach a real transcript. If the tool saved you a round of back-and-forth, a star helps other maintainers find it.

```sh
npm test
npm run build  # regenerates docs/index.html and the sample SVG
```

MIT licensed. Independent project; not affiliated with Anthropic or OpenAI.
