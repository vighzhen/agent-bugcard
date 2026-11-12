'use strict';

// Each row contains English, Simplified Chinese, then Traditional Chinese.
const BugcardLanguages = (() => {
  const columns = ['en', 'zh-Hans', 'zh-Hant'];
  const rows = {
    title: ['Agent Bugcard · Share an agent error', 'Agent Bugcard · 工具报错诊断卡', 'Agent Bugcard · 工具錯誤診斷卡'],
    hero: ['Turn an agent error into a bug report.', '把工具报错做成诊断卡', '將工具錯誤做成診斷卡'],
    intro: ['Choose a Claude Code or Codex CLI session. Copy the failing call into an issue or team chat. Commands, paths and conversations stay on your machine.', '选择 Claude Code 或 Codex CLI 会话，把出错的那一步贴进 Issue、工单或群聊。命令、路径和原始对话都留在本机。', '選擇 Claude Code 或 Codex CLI 工作階段，把出錯的步驟貼到 Issue、工單或群組聊天。指令、路徑與原始對話都留在本機。'],
    repo: ['GitHub ↗', '项目源码 ↗', '專案原始碼 ↗'],
    language: ['Language', '界面语言', '介面語言'],
    outputLanguage: ['Card language', '卡片语言', '卡片語言'],
    follow: ['Same as interface', '跟随界面', '跟隨介面'],
    choose: ['Choose a session', '选择会话', '選擇工作階段'],
    file: ['Open local JSONL…', '打开本地日志…', '開啟本機記錄檔…'],
    claude: ['Claude example', 'Claude 示例', 'Claude 範例'],
    codex: ['Codex example', 'Codex 示例', 'Codex 範例'],
    finder: ['Where is my session file?', '在哪里找会话文件？', '去哪裡找工作階段檔案？'],
    findSize: ['Open one saved JSONL file (up to 20 MiB) from the folders below. On macOS press ⌘⇧G in the file picker to enter the path.', '从以下目录的子文件夹中选择一份 JSONL 日志（最大 20 MiB）。macOS 可在文件选择窗口按 ⌘⇧G 输入路径。', '從下列資料夾的子目錄選取一份 JSONL 記錄檔（最多 20 MiB）。macOS 可在選擇檔案時按 ⌘⇧G 輸入路徑。'],
    windows: ['On Windows paste a path into File Explorer’s address bar:', 'Windows 可把下列路径粘贴到文件资源管理器的地址栏：', 'Windows 可將下列路徑貼到檔案總管的網址列：'],
    custom: ['If you set CLAUDE_CONFIG_DIR or CODEX_HOME, start in that folder.', '如果设置了 CLAUDE_CONFIG_DIR 或 CODEX_HOME，请从对应目录查找。', '若已設定 CLAUDE_CONFIG_DIR 或 CODEX_HOME，請從對應的資料夾尋找。'],
    attachment: ['Issue attachment', '诊断卡', '診斷卡'],
    copyMd: ['Copy for GitHub issue', '复制 Markdown', '複製 Markdown'],
    copyText: ['Copy for chat', '复制群聊文本', '複製聊天純文字'],
    savePng: ['Save PNG','保存图片 PNG','儲存圖片 PNG'],
    pngError: ['Could not create the PNG in this browser. Try Save SVG.','当前浏览器未能生成 PNG，可以改选“保存 SVG”。','目前瀏覽器無法產生 PNG，可改用「儲存 SVG」。'],
    more: ['Other files','其他文件格式','其他檔案格式'],
    saveSvg: ['Save SVG', '保存 SVG', '儲存 SVG'],
    saveMd: ['Save Markdown', '保存 Markdown', '儲存 Markdown'],
    exact: ['Preview exact Markdown', '查看完整 Markdown', '檢視完整 Markdown'],
    options: ['Sharing options', '分享选项', '分享選項'],
    focus: ['Focus on', '要报告的失败调用', '要回報的失敗呼叫'],
    nearby: ['Include nearby calls', '包含前后调用', '包含前後的呼叫'],
    categories: ['Show tool categories', '显示工具类别', '顯示工具類別'],
    codes: ['Include shell exit codes', '包含命令退出码', '包含指令結束碼'],
    sampleInput: ['See the synthetic input', '查看虚构的原始示例', '查看虛構範例的原始內容'],
    privacy: ['What stays private?', '哪些内容不会被分享？', '哪些內容會留在本機？'],
    privacyText: ['Prompts, replies, commands, raw output, paths, custom tool names, IDs and timestamps stay out of the card. A distinctive sequence may reveal your workflow. Review the preview before sharing.', '提示词、回复、命令、原始输出、路径、自定义工具名、ID 和时间戳都不会写进卡片。调用顺序仍可能反映工作方式，请预览后再分享。', '提示詞、回覆、指令、原始輸出、路徑、自訂工具名稱、ID 與時間戳記都不會寫入卡片。呼叫順序仍可能反映工作方式，請先預覽再分享。'],
    offline: ['Save offline HTML', '保存离线工具', '儲存離線工具'],
    footer: ['Local processing · No account or telemetry', '本机处理 · 不用登录 · 无遥测', '本機處理 · 不用登入 · 無遙測'],
    offlineHelp: ['Open the saved HTML in a desktop browser. You can also send the offline ZIP to a colleague.', '离线 HTML 用电脑浏览器打开即可。转发给同事时，也可以发送离线压缩包。', '以電腦瀏覽器開啟離線 HTML 即可使用。轉給同事時，也可傳送離線壓縮檔。'],
    offlineZip: ['Offline ZIP', '下载离线压缩包', '下載離線壓縮檔'],
    example: ['Synthetic example', '虚构示例', '虛構範例'],
    local: ['Local session', '本地会话', '本機工作階段'],
    summary: ['Session summary', '会话摘要', '工作階段摘要'],
    last: ['Last observed calls', '最近的工具调用', '最近的工具呼叫'],
    noCard: ['No receipt to export', '没有可导出的诊断卡', '沒有可匯出的診斷卡'],
    none: ['No supported tool calls found. Choose a Claude Code or Codex CLI session JSONL.', '未找到可识别的工具调用。请选择 Claude Code 或 Codex CLI 的 JSONL 会话文件。', '找不到可辨識的工具呼叫。請選擇 Claude Code 或 Codex CLI 的 JSONL 工作階段檔案。'],
    large: ['Choose a single JSONL file up to 20 MiB.', '请选择不超过 20 MiB 的单个 JSONL 文件。', '請選擇不超過 20 MiB 的單一 JSONL 檔案。'],
    loading: ['Reading the file locally…', '正在本机读取文件…', '正在本機讀取檔案…'],
    unreadable: ['Could not read the selected file.', '无法读取所选文件。', '無法讀取所選檔案。'],
    summaryScope: ['Only counts, agent format and parsing notes are shared.', '仅分享统计、工具来源和解析提示。', '僅分享統計、工具來源與解析提示。'],
    codeScope: ['Hiding exit codes also hides their troubleshooting hints.', '隐藏退出码也会隐藏对应的排查建议。', '隱藏結束碼也會隱藏對應的檢查建議。'],
    noCode: ['This session contains no recognized shell failure code.', '这份会话里没有可识别的命令失败退出码。', '這份工作階段沒有可辨識的指令失敗結束碼。'],
    copiedMd: ['Copied. Paste into your issue and describe what you expected.', '已复制 Markdown。在 Issue 或工单里粘贴，再补一句你原本期待的结果。', '已複製 Markdown。貼到 Issue 或工單後，可再補充預期結果。'],
    copiedText: ['Plain text copied. Paste it into your team chat.', '已复制纯文本，可直接粘贴到群聊。', '已複製純文字，可直接貼到群組聊天。'],
    manual: ['Text selected. Press Ctrl+C or ⌘C, or press and hold to copy.', '已选中文本。按 Ctrl+C、⌘C，或在手机上长按复制。', '已選取文字。按 Ctrl+C、⌘C，或在手機上長按複製。'],
    textPreview: ['Preview chat text', '查看群聊纯文本', '檢視聊天純文字'],
    command: ['Command', '命令', '指令'], result: ['Result', '结果', '結果'],
    call: ['Call','调用','呼叫'], category:['Category','类别','類別'], outcome:['Outcome','状态','狀態'],
    numbered: ['Call #{n}','第 {n} 次调用','第 {n} 次呼叫'],
    Error: ['Error','报错','錯誤'], Returned:['Returned','已返回','已傳回'], Unpaired:['Unpaired','未配对','未配對'],
    Shell:['Shell','命令行','命令列'], Read:['Read','读取','讀取'], Edit:['Edit','编辑','編輯'], Search:['Search','搜索','搜尋'], Fetch:['Fetch','获取','擷取'], Delegate:['Delegate','委派','委派'], Other:['Other','其他','其他'],
    'Mixed formats':['Mixed formats','混合格式','混合格式'],Unknown:['Unknown','未知','未知'],
    exit: ['Error (exit {n})','报错（退出码 {n}）','錯誤（結束碼 {n}）'],
    hint126:['On a POSIX shell, check whether the command can be executed.','若使用 POSIX shell，先检查文件类型和执行权限。','若使用 POSIX shell，先檢查檔案類型與執行權限。'],
    hint127:['On a POSIX shell, check the command name and PATH.','若使用 POSIX shell，先确认能否在 PATH 中找到这条命令。','若使用 POSIX shell，先確認能否在 PATH 中找到這個指令。'],
    legend:['Returned means a response was recorded.','“已返回”表示工具给出了响应，执行结果仍需确认。','「已傳回」表示工具已回應，執行結果仍需確認。'],
    partial:['Partial input','部分输入未能解析','部分輸入未能解析'],
    invalid:['{n} malformed lines skipped','已跳过 {n} 行无效 JSON','已略過 {n} 行無效 JSON'],
    unmatched:['{n} unmatched result IDs','有 {n} 个结果找不到对应调用','有 {n} 個結果找不到對應呼叫'],
    next:['Next check','下一步排查','下一步檢查'],
    generated:['Generated locally with','本机生成工具','本機產生工具'],
    localNote:['Generated locally.','在本机生成。','在本機產生。'],
    svgTitle:['tool-call receipt','工具调用诊断卡','工具呼叫診斷卡'],
    ready:['Ready for review. Only recognized calls are counted.','可以预览。仅统计可识别的调用。','可開始預覽。僅統計可辨識的呼叫。'],
    counts:['','{n} 次调用 · {e} 次报错 · {u} 次未配对','{n} 次呼叫 · {e} 次錯誤 · {u} 次未配對'],
    cliUsage:['Usage','用法','用法'],
    cliRead:['Could not read the selected file.','无法读取所选文件。','無法讀取所選檔案。'],
    cliNone:['No supported tool calls found. No card generated.','未找到可识别的工具调用，无法生成诊断卡。','找不到可辨識的工具呼叫，無法產生診斷卡。'],
    cliNumber:['Choose a positive error call number.','请输入正整数调用编号。','請輸入正整數呼叫編號。'],
    cliCall:['That call has no reported error. Choose a reported error call number.','该调用没有报错。请选择已报错的调用编号。','該呼叫沒有回報錯誤。請選擇已出錯的呼叫編號。'],
    cliSize:['Choose a regular JSONL file up to 20 MiB.','请选择不超过 20 MiB 的普通 JSONL 文件。','請選擇不超過 20 MiB 的一般 JSONL 檔案。']
  };

  function match(tag) {
    if (typeof tag !== 'string' || !tag) return null;
    const normalized = tag.trim().replace(/_/g,'-');
    const parts = normalized.split('-');
    if (!/^(en|zh|cmn)$/i.test(parts[0])) return null;
    if (parts[0].toLowerCase() === 'en') return 'en';
    // Match script before region. Stop before extensions, which can name unrelated regions.
    const subtags = [];
    for (const part of parts.slice(1)) {
      if (part.length === 1) break;
      subtags.push(part.toLowerCase());
    }
    if (subtags.includes('hant') || subtags.includes('cht')) return 'zh-Hant';
    if (subtags.includes('hans') || subtags.includes('chs')) return 'zh-Hans';
    return subtags.some(code=>['tw','hk','mo'].includes(code)) ? 'zh-Hant' : 'zh-Hans';
  }
  function select(preferences) {
    for (const tag of preferences) {
      const supported = match(tag);
      if (supported) return supported;
    }
    return 'en';
  }
  function text(lang, key, data = {}) {
    const row = Object.prototype.hasOwnProperty.call(rows,key) ? rows[key] : null;
    if (!row) throw new Error('Unknown message key: ' + key);
    const index = columns.indexOf(lang);
    return row[index < 0 ? 0 : index].replace(/\{(\w+)\}/g, (_,k)=>String(data[k]));
  }
  function counts(lang, report, full = false) {
    if (lang !== 'en') return text(lang,'counts',{n:report.count,e:report.errors,u:report.unpaired});
    const plural = (n,s) => n + ' ' + s + (n === 1 ? '' : 's');
    return plural(report.count,full ? 'recognized tool call' : 'call') + ' · ' +
      plural(report.errors,'reported error') + ' · ' +
      (full ? plural(report.unpaired,'unpaired call') : report.unpaired + ' unpaired');
  }
  return {columns, match, select, text, counts};
})();
if (typeof module !== 'undefined' && module.exports) module.exports = BugcardLanguages;
