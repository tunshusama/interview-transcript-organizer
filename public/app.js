const elements = {
  provider: document.querySelector("#provider"),
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
  imageBtn: document.querySelector("#imageBtn"),
  printBtn: document.querySelector("#printBtn")
};

let currentMarkdown = "";
let currentReport = null;
const ITEMS_PER_PAGE = 3;
const PROVIDER_PRESETS = {
  deepseek: {
    apiUrl: "https://api.deepseek.com/chat/completions",
    model: "deepseek-chat"
  },
  openai: {
    apiUrl: "https://api.openai.com/v1/chat/completions",
    model: "gpt-4o-mini"
  },
  moonshot: {
    apiUrl: "https://api.moonshot.cn/v1/chat/completions",
    model: "moonshot-v1-8k"
  },
  qwen: {
    apiUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
    model: "qwen-plus"
  },
  zhipu: {
    apiUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    model: "glm-4-flash"
  },
  openrouter: {
    apiUrl: "https://openrouter.ai/api/v1/chat/completions",
    model: "deepseek/deepseek-chat-v3.1"
  },
  ollama: {
    apiUrl: "http://localhost:11434/v1/chat/completions",
    model: "llama3.1"
  }
};

elements.provider.value = localStorage.getItem("llm_provider") || "deepseek";
elements.apiKey.value = localStorage.getItem("llm_api_key") || localStorage.getItem("deepseek_api_key") || "";
elements.apiUrl.value = localStorage.getItem("llm_api_url") || PROVIDER_PRESETS.deepseek.apiUrl;
elements.model.value = localStorage.getItem("llm_model") || localStorage.getItem("deepseek_model") || PROVIDER_PRESETS.deepseek.model;

elements.provider.addEventListener("change", () => {
  const provider = elements.provider.value;
  localStorage.setItem("llm_provider", provider);

  if (provider === "custom") return;

  const preset = PROVIDER_PRESETS[provider];
  if (!preset) return;
  elements.apiUrl.value = preset.apiUrl;
  elements.model.value = preset.model;
  localStorage.setItem("llm_api_url", preset.apiUrl);
  localStorage.setItem("llm_model", preset.model);
});

elements.apiKey.addEventListener("input", () => {
  localStorage.setItem("llm_api_key", elements.apiKey.value.trim());
});

elements.apiUrl.addEventListener("input", () => {
  localStorage.setItem("llm_api_url", elements.apiUrl.value.trim() || PROVIDER_PRESETS.deepseek.apiUrl);
  markCustomProvider();
});

elements.model.addEventListener("input", () => {
  localStorage.setItem("llm_model", elements.model.value.trim() || PROVIDER_PRESETS.deepseek.model);
  markCustomProvider();
});

elements.transcript.addEventListener("input", updateWordCount);
elements.clearBtn.addEventListener("click", clearAll);
elements.analyzeBtn.addEventListener("click", analyzeTranscript);
elements.copyBtn.addEventListener("click", copyMarkdown);
elements.downloadBtn.addEventListener("click", downloadMarkdown);
elements.imageBtn.addEventListener("click", downloadPageImages);
elements.printBtn.addEventListener("click", printPagesAsImages);

updateWordCount();

function markCustomProvider() {
  elements.provider.value = "custom";
  localStorage.setItem("llm_provider", "custom");
}

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
  elements.imageBtn.disabled = !enabled;
  elements.printBtn.disabled = !enabled;
}

async function downloadPageImages() {
  const pages = getReportPages();
  if (!pages.length) return;

  setExportBusy(true, "正在生成图片...");
  try {
    for (const [index, page] of pages.entries()) {
      const dataUrl = await renderPageToPng(page);
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${slugify(currentReport?.title || "interview-report")}-page-${String(index + 1).padStart(2, "0")}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      await wait(160);
    }
    setStatus(`已生成 ${pages.length} 张页面图片。`);
  } catch (error) {
    setStatus(error.message || "图片生成失败，请重试。", true);
  } finally {
    setExportBusy(false);
  }
}

async function printPagesAsImages() {
  const pages = getReportPages();
  if (!pages.length) return;

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    setStatus("浏览器阻止了打印窗口，请允许弹窗后重试。", true);
    return;
  }
  printWindow.document.write("<p style=\"font-family: system-ui, sans-serif; padding: 24px;\">正在准备 PDF...</p>");
  printWindow.document.close();

  setExportBusy(true, "正在准备 PDF...");
  try {
    const images = [];
    for (const page of pages) {
      images.push(await renderPageToPng(page));
    }
    writeImagePrintWindow(printWindow, images);
    setStatus("打印窗口已打开，可选择另存为 PDF。");
  } catch (error) {
    printWindow.close();
    setStatus(error.message || "PDF 生成失败，请重试。", true);
  } finally {
    setExportBusy(false);
  }
}

function getReportPages() {
  return Array.from(elements.report.querySelectorAll(".page"));
}

async function renderPageToPng(page) {
  const rect = page.getBoundingClientRect();
  const width = Math.ceil(rect.width);
  const height = Math.ceil(page.scrollHeight);
  const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const clone = page.cloneNode(true);

  inlineComputedStyles(page, clone);
  clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
  clone.style.width = `${width}px`;
  clone.style.height = `${height}px`;
  clone.style.margin = "0";
  clone.style.boxShadow = "none";

  const serialized = new XMLSerializer().serializeToString(clone);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <foreignObject width="100%" height="100%">${serialized}</foreignObject>
    </svg>
  `;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = await loadImage(url);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);

  const context = canvas.getContext("2d");
  context.scale(scale, scale);
  context.fillStyle = "#fffdfa";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  return canvas.toDataURL("image/png");
}

function inlineComputedStyles(source, clone) {
  const computed = window.getComputedStyle(source);
  clone.style.cssText = computed.cssText;

  Array.from(source.children).forEach((sourceChild, index) => {
    const cloneChild = clone.children[index];
    if (cloneChild) inlineComputedStyles(sourceChild, cloneChild);
  });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("页面图片渲染失败。"));
    image.src = url;
  });
}

function writeImagePrintWindow(printWindow, images) {
  const imageTags = images
    .map((src, index) => `<section class="print-page"><img src="${src}" alt="Page ${index + 1}" /></section>`)
    .join("");

  printWindow.document.open();
  printWindow.document.write(`
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(currentReport?.title || "面试复盘报告")}</title>
        <style>
          @page { size: A4; margin: 0; }
          * { box-sizing: border-box; }
          body { margin: 0; background: white; }
          .print-page {
            width: 210mm;
            height: 297mm;
            display: grid;
            place-items: center;
            page-break-after: always;
            break-after: page;
            overflow: hidden;
            background: white;
          }
          .print-page:last-child { page-break-after: auto; break-after: auto; }
          img {
            display: block;
            max-width: 100%;
            max-height: 100%;
            width: auto;
            height: auto;
          }
        </style>
      </head>
      <body>${imageTags}</body>
    </html>
  `);
  printWindow.document.close();

  const waitForImages = Array.from(printWindow.document.images).map((image) => {
    if (image.complete) return Promise.resolve();
    return new Promise((resolve) => {
      image.onload = resolve;
      image.onerror = resolve;
    });
  });

  Promise.all(waitForImages).then(() => {
    printWindow.focus();
    printWindow.print();
  });
}

function setExportBusy(isBusy, message = "") {
  elements.copyBtn.disabled = isBusy;
  elements.downloadBtn.disabled = isBusy;
  elements.imageBtn.disabled = isBusy;
  elements.printBtn.disabled = isBusy;
  if (message) setStatus(message);
  if (!isBusy && currentReport) setExportEnabled(true);
}

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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
