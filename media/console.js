"use strict";
(() => {
  // src/webview/console.ts
  var api = acquireVsCodeApi();
  var editor = byId("editor");
  var runButton = byId("run");
  var status = byId("status");
  var resultTable = byId("result");
  var saveTimer = 0;
  runButton.addEventListener("click", run);
  editor.addEventListener("input", () => {
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => api.postMessage({ type: "save", sql: editor.value }), 400);
  });
  editor.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      run();
    } else if (event.key === "Tab") {
      event.preventDefault();
      insertAtCursor("  ");
    }
  });
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (message.type === "init") {
      editor.value = message.sql;
      return;
    }
    if (message.type === "result") {
      renderResult(message);
    }
  });
  api.postMessage({ type: "ready" });
  function run() {
    const selection = editor.value.slice(editor.selectionStart, editor.selectionEnd);
    const sql = selection.trim() !== "" ? selection : editor.value;
    if (sql.trim() === "") {
      return;
    }
    status.textContent = "Running\u2026";
    api.postMessage({ type: "run", sql });
  }
  function renderResult(message) {
    if (message.error) {
      status.textContent = "";
      resultTable.replaceChildren();
      resultTable.classList.add("error-view");
      resultTable.textContent = message.error;
      return;
    }
    resultTable.classList.remove("error-view");
    resultTable.textContent = "";
    if (message.columns.length === 0) {
      status.textContent = `Query OK \xB7 ${message.affectedRows ?? 0} row(s) affected`;
      resultTable.replaceChildren();
      return;
    }
    status.textContent = `${message.rows.length} row(s)`;
    const head = document.createElement("thead");
    const headRow = document.createElement("tr");
    for (const column of message.columns) {
      const th = document.createElement("th");
      th.textContent = column;
      headRow.appendChild(th);
    }
    head.appendChild(headRow);
    const bodyEl = document.createElement("tbody");
    for (const row of message.rows) {
      const tr = document.createElement("tr");
      for (const cell of row) {
        const td = document.createElement("td");
        if (cell === null) {
          td.textContent = "NULL";
          td.className = "null";
        } else {
          td.textContent = cell;
        }
        tr.appendChild(td);
      }
      bodyEl.appendChild(tr);
    }
    resultTable.replaceChildren(head, bodyEl);
  }
  function insertAtCursor(text) {
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.value = editor.value.slice(0, start) + text + editor.value.slice(end);
    editor.selectionStart = editor.selectionEnd = start + text.length;
    api.postMessage({ type: "save", sql: editor.value });
  }
  function byId(id) {
    const found = document.getElementById(id);
    if (!found) {
      throw new Error(`Missing element #${id}`);
    }
    return found;
  }
})();
//# sourceMappingURL=console.js.map
