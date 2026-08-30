document.addEventListener("DOMContentLoaded", () => {
  // DOM Elements
  const explainForm = document.getElementById("explainForm");
  const repoUrlInput = document.getElementById("repoUrlInput");
  const submitBtn = document.getElementById("submitBtn");
  const sampleChips = document.getElementById("sampleChips");

  const progressSection = document.getElementById("progressSection");
  const progressTitle = document.getElementById("progressTitle");
  const progressSubtitle = document.getElementById("progressSubtitle");

  const errorSection = document.getElementById("errorSection");
  const errorMessage = document.getElementById("errorMessage");
  const dismissErrorBtn = document.getElementById("dismissErrorBtn");

  const resultsSection = document.getElementById("resultsSection");
  const repoLink = document.getElementById("repoLink");
  const starsCount = document.getElementById("starsCount");
  const defaultBranch = document.getElementById("defaultBranch");
  const licenseName = document.getElementById("licenseName");
  const fileCount = document.getElementById("fileCount");
  const repoDescription = document.getElementById("repoDescription");
  const techStackChips = document.getElementById("techStackChips");

  const tabButtons = document.querySelectorAll(".tab-pill");
  const tabViews = document.querySelectorAll(".tab-view");

  const reportContent = document.getElementById("reportContent");
  const folderList = document.getElementById("folderList");
  const keyFilesList = document.getElementById("keyFilesList");
  const rawMarkdownTextarea = document.getElementById("rawMarkdownTextarea");

  const copyMarkdownBtn = document.getElementById("copyMarkdownBtn");
  const downloadBtn = document.getElementById("downloadBtn");
  const toastContainer = document.getElementById("toastContainer");

  let currentReportMarkdown = "";
  let currentRepoName = "repository";

  // Configure Marked.js
  if (window.marked) {
    marked.setOptions({
      breaks: true,
      gfm: true,
      highlight: function (code, lang) {
        if (window.hljs && lang && hljs.getLanguage(lang)) {
          try {
            return hljs.highlight(code, { language: lang }).value;
          } catch (e) {
            console.error(e);
          }
        }
        return code;
      }
    });
  }

  // Load sample repositories dynamically
  async function loadSamples() {
    try {
      const response = await fetch("/api/samples");
      if (response.ok) {
        const data = await response.json();
        if (data.samples && data.samples.length > 0) {
          sampleChips.innerHTML = "";
          data.samples.forEach(sample => {
            const btn = document.createElement("button");
            btn.className = "pill-btn";
            btn.dataset.url = sample.url;
            btn.textContent = sample.name;
            btn.addEventListener("click", () => {
              repoUrlInput.value = sample.url;
              handleFormSubmit(sample.url);
            });
            sampleChips.appendChild(btn);
          });
        }
      }
    } catch (err) {
      console.warn("Could not load dynamic samples:", err);
    }
  }

  loadSamples();

  // Fallback click listener for HTML sample pills
  document.querySelectorAll(".pill-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const url = btn.getAttribute("data-url");
      if (url) {
        repoUrlInput.value = url;
        handleFormSubmit(url);
      }
    });
  });

  // Error Dismiss
  dismissErrorBtn.addEventListener("click", () => {
    errorSection.style.display = "none";
  });

  // Tab Navigation (Segmented Switcher)
  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      tabButtons.forEach(b => b.classList.remove("active"));
      tabViews.forEach(v => v.classList.remove("active"));

      btn.classList.add("active");
      const targetId = btn.getAttribute("data-tab");
      const targetView = document.getElementById(targetId);
      if (targetView) {
        targetView.classList.add("active");
      }
    });
  });

  // Progress animation
  let progressTimer = null;
  function startProgress() {
    progressSection.style.display = "block";
    errorSection.style.display = "none";
    progressTitle.textContent = "Connecting to GitHub...";
    progressSubtitle.textContent = "Fetching repository tree & metadata";

    let step = 1;
    progressTimer = setInterval(() => {
      step++;
      if (step === 2) {
        progressTitle.textContent = "Analyzing structure & tech stack...";
        progressSubtitle.textContent = "Extracting dependencies, manifests, and key files";
      } else if (step === 3) {
        progressTitle.textContent = "Synthesizing architectural breakdown...";
        progressSubtitle.textContent = "Generating technical explanation and report";
      }
    }, 1800);
  }

  function stopProgress() {
    if (progressTimer) {
      clearInterval(progressTimer);
      progressTimer = null;
    }
    progressSection.style.display = "none";
  }

  // Toast Notification
  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(8px)";
      setTimeout(() => toast.remove(), 200);
    }, 2200);
  }

  // Format Star Numbers
  function formatStars(count) {
    if (!count) return "0";
    if (count >= 1000000) return (count / 1000000).toFixed(1) + "M";
    if (count >= 1000) return (count / 1000).toFixed(1) + "k";
    return count.toString();
  }

  // Form Submit Handler
  explainForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const url = repoUrlInput.value.trim();
    if (url) {
      handleFormSubmit(url);
    }
  });

  async function handleFormSubmit(repoUrl) {
    if (!repoUrl) return;

    submitBtn.disabled = true;
    startProgress();

    try {
      const response = await fetch("/api/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: repoUrl })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to analyze repository.");
      }

      currentReportMarkdown = data.report || "";
      currentRepoName = `${data.owner}_${data.repo}`;

      renderResults(data);
      resultsSection.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      errorSection.style.display = "block";
      errorMessage.textContent = err.message || "An unexpected error occurred.";
      resultsSection.style.display = "none";
    } finally {
      stopProgress();
      submitBtn.disabled = false;
    }
  }

  // Render Full Results
  function renderResults(data) {
    resultsSection.style.display = "flex";

    // 1. Header Details
    repoLink.textContent = `${data.owner} / ${data.repo}`;
    repoLink.href = `https://github.com/${data.owner}/${data.repo}`;
    starsCount.textContent = formatStars(data.metadata.stars);
    defaultBranch.textContent = data.metadata.default_branch || "main";
    licenseName.textContent = data.metadata.license || "No License";
    fileCount.textContent = `${data.file_count || 0} files`;
    repoDescription.textContent = data.metadata.description || "No description provided.";

    // 2. Tech Stack Chips
    techStackChips.innerHTML = "";
    if (data.tech_stack && data.tech_stack.length > 0) {
      data.tech_stack.forEach(tech => {
        const pill = document.createElement("span");
        pill.className = "tech-pill";
        pill.textContent = tech;
        techStackChips.appendChild(pill);
      });
    } else {
      techStackChips.innerHTML = '<span style="color:var(--text-muted);font-size:0.75rem">None detected</span>';
    }

    // 3. Markdown Report Tab
    if (window.marked && window.DOMPurify) {
      const rawHtml = marked.parse(data.report || "No report generated.");
      reportContent.innerHTML = DOMPurify.sanitize(rawHtml);
      if (window.hljs) {
        reportContent.querySelectorAll("pre code").forEach((el) => {
          hljs.highlightElement(el);
        });
      }
    } else {
      reportContent.textContent = data.report || "No report generated.";
    }

    // 4. Structure Tab: Folder Distribution
    folderList.innerHTML = "";
    const folders = data.folder_groups || {};
    Object.keys(folders).forEach(folder => {
      const item = document.createElement("div");
      item.className = "list-item";
      item.innerHTML = `
        <span>${folder === "root" ? "/ (Root Files)" : folder}</span>
        <span style="color:var(--text-muted)">${folders[folder]} files</span>
      `;
      folderList.appendChild(item);
    });

    // 5. Structure Tab: Key Files
    keyFilesList.innerHTML = "";
    if (data.key_files && data.key_files.length > 0) {
      data.key_files.forEach(file => {
        const item = document.createElement("div");
        item.className = "list-item";
        const path = typeof file === "string" ? file : file.path;
        const sizeStr = file.size ? (file.size > 1024 ? (file.size / 1024).toFixed(1) + ' KB' : file.size + ' B') : '';
        item.innerHTML = `
          <span>${path}</span>
          <span style="color:var(--text-muted)">${sizeStr}</span>
        `;
        keyFilesList.appendChild(item);
      });
    }

    // 6. Raw Markdown Tab
    rawMarkdownTextarea.value = data.report || "";
  }

  // Copy Markdown to Clipboard
  copyMarkdownBtn.addEventListener("click", async () => {
    if (!currentReportMarkdown) return;
    try {
      await navigator.clipboard.writeText(currentReportMarkdown);
      showToast("Report copied to clipboard");
    } catch (err) {
      rawMarkdownTextarea.select();
      document.execCommand("copy");
      showToast("Report copied to clipboard");
    }
  });

  // Download .md File
  downloadBtn.addEventListener("click", () => {
    if (!currentReportMarkdown) return;
    const blob = new Blob([currentReportMarkdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${currentRepoName}-report.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast("Downloaded report markdown");
  });
});
