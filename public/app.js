const elements = {
  apiKey: document.querySelector("#apiKey"),
  apiUrl: document.querySelector("#apiUrl"),
  model: document.querySelector("#model"),
  transcript: document.querySelector("#transcript"),
  wordCount: document.querySelector("#wordCount"),
  analyzeBtn: document.querySelector("#analyzeBtn"),
  clearBtn: document.querySelector("#clearBtn"),
  status: document.querySelector("#status"),
  report: document.querySelector("#report"),
  reportTitle: document.querySelector("#reportTitle"),
  copyBtn: document.querySelector("#copyBtn"),
  downloadBtn: document.querySelector("#downloadBtn"),
  printBtn: document.querySelector("#printBtn")
};

let currentMarkdown = "";
let currentReport = null;
const ITEMS_PER_PAGE = 3;

elements.apiKey.value = localStorage.getItem("llm_api_key") || localStorage.getItem("deepseek_api_key") || "";
elements.apiUrl.value = localStorage.getItem("llm_api_url") || "https://api.deepseek.com/chat/completions";
elements.model.value = localStorage.getItem("llm_model") || localStorage.getItem("deepseek_model") || "deepseek-chat";

elements.apiKey.addEventListener("input", () => {
  localStorage.setItem("llm_api_key", elements.apiKey.value.trim());
});

elements.apiUrl.addEventListener("input", () => {
  localStorage.setItem("llm_api_url", elements.apiUrl.value.trim() || "https://api.deepseek.com/chat/completions");
});

elements.model.addEventListener("input", () => {
  localStorage.setItem("llm_model", elements.model.value.trim() || "deepseek-chat");
});

elements.transcript.addEventListener("input", updateWordCount);
elements.clearBtn.addEventListener("click", clearAll);
elements.analyzeBtn.addEventListener("click", analyzeTranscript);
elements.copyBtn.addEventListener("click", copyMarkdown);
elements.downloadBtn.addEventListener("click", downloadMarkdown);
elements.printBtn.addEventListener("click", () => window.print());

updateWordCount();

async function analyzeTranscript() {
  const transcript = elements.transcript.value.trim();
  const apiKey = elements.apiKey.value.trim();
  const apiUrl = elements.apiUrl.value.trim();
  const model = elements.model.value.trim() || "deepseek-chat";

  if (!transcript) {
    setStatus("先粘贴一份转写稿。", true);
    return;
  }

  setBusy(true);
  setStatus("正在整理，长转写可能需要一两分钟。");

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, apiKey, apiUrl, model })
    });

    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "生成失败。");
    }

    currentReport = payload.report;
    currentMarkdown = toMarkdown(currentReport);
    renderReport(currentReport);
    setStatus(`生成完成，共 ${currentReport.items.length} 个问题。`);
  } catch (error) {
    setStatus(error.message || "生成失败，请重试。", true);
  } finally {
    setBusy(false);
  }
}

function renderReport(report) {
  elements.report.className = "";
  elements.reportTitle.textContent = report.title || "面试复盘报告";
  elements.report.innerHTML = "";

  const overviewPage = document.createElement("article");
  overviewPage.className = "page";
  overviewPage.innerHTML = `
    <div class="page-kicker">
      <span>Page 01</span>
      <span>面试官问题整合</span>
    </div>
    <h2>${escapeHtml(report.title || "面试复盘报告")}</h2>
    ${renderThemes(report.overview?.themes || [])}
    <ol class="question-list">
      ${(report.overview?.integratedQuestions?.length
        ? report.overview.integratedQuestions
        : report.items.map((item) => item.question))
        .map((question, index) => `<li><span>Q${index + 1}</span>${escapeHtml(question)}</li>`)
        .join("")}
    </ol>
  `;
  elements.report.appendChild(overviewPage);

  chunkItems(report.items, ITEMS_PER_PAGE).forEach((items, pageIndex) => {
    const startIndex = pageIndex * ITEMS_PER_PAGE;
    const page = document.createElement("article");
    page.className = "page";
    page.innerHTML = `
      <div class="page-kicker">
        <span>Page ${String(pageIndex + 2).padStart(2, "0")}</span>
        <span>Q${startIndex + 1}-Q${startIndex + items.length}</span>
      </div>
      <div class="qa-list">
        ${items.map((item, itemIndex) => renderQaItem(item, startIndex + itemIndex)).join("")}
      </div>
    `;
    elements.report.appendChild(page);
  });

  setExportEnabled(true);
}

function renderThemes(themes) {
  if (!themes.length) return "";
  return `<div class="themes">${themes.map((theme) => `<span>${escapeHtml(theme)}</span>`).join("")}</div>`;
}

function renderQaItem(item, index) {
  return `
    <section class="qa-item">
      <div class="q-label">Q${index + 1}</div>
      <div>
        <p class="section-label">面试官问题</p>
        <h3>${escapeHtml(item.question)}</h3>
        <section class="answer-block">
          <p class="section-label">我的回答简要概括</p>
          <p>${escapeHtml(item.answerSummary)}</p>
        </section>
        ${item.improvement ? `
          <section class="improvement-block">
            <p class="section-label">答得不好的点以及如何修改</p>
            <p>${escapeHtml(item.improvement)}</p>
          </section>
        ` : ""}
      </div>
    </section>
  `;
}

function toMarkdown(report) {
  const lines = [`# ${report.title || "面试复盘报告"}`, ""];
  const questions = report.overview?.integratedQuestions?.length
    ? report.overview.integratedQuestions
    : report.items.map((item) => item.question);

  lines.push("## 第一页：面试官问题整合", "");
  questions.forEach((question, index) => {
    lines.push(`Q${index + 1}. ${question}`);
  });

  if (report.overview?.themes?.length) {
    lines.push("", `主要考察方向：${report.overview.themes.join("、")}`);
  }

  chunkItems(report.items, ITEMS_PER_PAGE).forEach((items, pageIndex) => {
    const startIndex = pageIndex * ITEMS_PER_PAGE;
    lines.push("", `## 第 ${pageIndex + 2} 页：Q${startIndex + 1}-Q${startIndex + items.length}`, "");

    items.forEach((item, itemIndex) => {
      const questionIndex = startIndex + itemIndex + 1;
      lines.push(`### Q${questionIndex}`, "");
      lines.push(`**面试官问题**：${item.question}`, "");
      lines.push(`**我的回答简要概括**：${item.answerSummary}`);
      if (item.improvement) {
        lines.push("", `**答得不好的点以及如何修改**：${item.improvement}`);
      }
      lines.push("");
    });
  });

  return lines.join("\n");
}

function chunkItems(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function copyMarkdown() {
  if (!currentMarkdown) return;
  await navigator.clipboard.writeText(currentMarkdown);
  setStatus("Markdown 已复制。");
}

function downloadMarkdown() {
  if (!currentMarkdown) return;
  const blob = new Blob([currentMarkdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugify(currentReport?.title || "interview-report")}.md`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function clearAll() {
  elements.transcript.value = "";
  updateWordCount();
  setStatus("");
}

function updateWordCount() {
  const count = elements.transcript.value.trim().replace(/\s/g, "").length;
  elements.wordCount.textContent = `${count} 字`;
}

function setBusy(isBusy) {
  elements.analyzeBtn.disabled = isBusy;
  elements.analyzeBtn.textContent = isBusy ? "生成中..." : "生成复盘";
}

function setExportEnabled(enabled) {
  elements.copyBtn.disabled = !enabled;
  elements.downloadBtn.disabled = !enabled;
  elements.printBtn.disabled = !enabled;
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.style.color = isError ? "var(--warn)" : "var(--muted)";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugify(value) {
  const normalized = String(value || "interview-report")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "")
    .replace(/\s+/g, "-");
  return normalized || "interview-report";
}
