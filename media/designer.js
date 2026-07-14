"use strict";
(() => {
  // src/webview/designer.ts
  var api = acquireVsCodeApi();
  var TYPE_GROUPS = {
    mysql: [
      { label: "Numeric", types: ["int", "bigint", "tinyint", "smallint", "mediumint", "decimal", "float", "double"] },
      { label: "Text", types: ["varchar", "char", "text", "tinytext", "mediumtext", "longtext", "json"] },
      { label: "Date & time", types: ["date", "datetime", "timestamp", "time", "year"] },
      { label: "Boolean", types: ["boolean"] },
      { label: "Binary", types: ["binary", "varbinary", "blob"] }
    ],
    postgres: [
      { label: "Numeric", types: ["integer", "bigint", "smallint", "serial", "bigserial", "numeric", "real", "double precision"] },
      { label: "Text", types: ["varchar", "char", "text", "json", "jsonb", "uuid"] },
      { label: "Date & time", types: ["date", "timestamp", "timestamptz", "time"] },
      { label: "Boolean", types: ["boolean"] },
      { label: "Binary", types: ["bytea"] }
    ]
  };
  function flatTypes(kind) {
    return TYPE_GROUPS[kind].flatMap((group) => group.types);
  }
  var mode = "create";
  var driver = "mysql";
  var columns = [];
  var indexes = [];
  var foreignKeys = [];
  var body = byId("columnsBody");
  var indexesBody = byId("indexesBody");
  var fksBody = byId("fksBody");
  var tableNameInput = byId("tableName");
  var tableNameWrap = byId("tableNameWrap");
  var applyButton = byId("apply");
  var sqlEl = byId("sql");
  var notice = byId("notice");
  byId("addColumn").addEventListener("click", addColumn);
  byId("addIndex").addEventListener("click", addIndex);
  byId("addFk").addEventListener("click", addFk);
  applyButton.addEventListener("click", () => send("apply"));
  tableNameInput.addEventListener("input", changed);
  var previewTimer = 0;
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (message.type === "init") {
      mode = message.mode;
      driver = message.driver;
      tableNameInput.value = message.table;
      tableNameWrap.style.display = mode === "create" ? "" : "none";
      columns = message.design.columns;
      indexes = message.design.indexes;
      foreignKeys = message.design.foreignKeys;
      notice.textContent = "";
      notice.classList.remove("error");
      render();
      return;
    }
    if (message.type === "sql") {
      sqlEl.textContent = message.sql;
      return;
    }
    if (message.type === "error") {
      notice.textContent = message.message;
      notice.classList.add("error");
    }
  });
  api.postMessage({ type: "ready" });
  function send(kind) {
    api.postMessage({ type: kind, table: tableNameInput.value.trim(), design: { columns, indexes, foreignKeys } });
  }
  function changed() {
    validate();
    clearTimeout(previewTimer);
    previewTimer = window.setTimeout(() => send("preview"), 200);
  }
  function validate() {
    const active = columns.filter((column) => !column.drop);
    const nameOk = mode === "modify" || tableNameInput.value.trim() !== "";
    const columnsOk = active.length > 0 && active.every((column) => column.name.trim() !== "" && column.type.trim() !== "");
    applyButton.disabled = !(nameOk && columnsOk);
  }
  function addColumn() {
    columns.push({
      originalName: null,
      name: "",
      type: flatTypes(driver)[0],
      isNullable: true,
      isPrimaryKey: false,
      isAutoIncrement: false,
      defaultValue: null,
      drop: false
    });
    render();
  }
  function render() {
    body.replaceChildren(...columns.map((draft, index) => buildRow(draft, index)));
    indexesBody.replaceChildren(...indexes.map((draft, index) => buildIndexRow(draft, index)));
    fksBody.replaceChildren(...foreignKeys.map((draft, index) => buildFkRow(draft, index)));
    changed();
  }
  function addIndex() {
    indexes.push({ originalName: null, name: "", isUnique: false, columns: [], drop: false });
    render();
  }
  function addFk() {
    foreignKeys.push({ originalName: null, name: "", columns: [], refTable: "", refColumns: [], onDelete: "", drop: false });
    render();
  }
  function buildIndexRow(draft, index) {
    const row = document.createElement("tr");
    if (draft.drop) {
      row.classList.add("dropped");
    }
    row.appendChild(rowAction(draft, () => indexes.splice(index, 1)));
    row.appendChild(textCell(draft.name, (value) => draft.name = value));
    row.appendChild(checkCell(draft.isUnique, (value) => draft.isUnique = value));
    row.appendChild(textCell(draft.columns.join(", "), (value) => draft.columns = splitCsv(value)));
    return row;
  }
  function buildFkRow(draft, index) {
    const row = document.createElement("tr");
    if (draft.drop) {
      row.classList.add("dropped");
    }
    row.appendChild(rowAction(draft, () => foreignKeys.splice(index, 1)));
    row.appendChild(textCell(draft.name, (value) => draft.name = value));
    row.appendChild(textCell(draft.columns.join(", "), (value) => draft.columns = splitCsv(value)));
    row.appendChild(textCell(draft.refTable, (value) => draft.refTable = value));
    row.appendChild(textCell(draft.refColumns.join(", "), (value) => draft.refColumns = splitCsv(value)));
    row.appendChild(onDeleteCell(draft));
    return row;
  }
  function rowAction(draft, remove) {
    const cell = document.createElement("td");
    cell.className = "actions";
    const button = document.createElement("button");
    button.textContent = draft.drop ? "\u21BA" : "\xD7";
    button.addEventListener("click", () => {
      if (mode === "modify" && draft.originalName) {
        draft.drop = !draft.drop;
      } else {
        remove();
      }
      render();
    });
    cell.appendChild(button);
    return cell;
  }
  function onDeleteCell(draft) {
    const cell = document.createElement("td");
    const select = document.createElement("select");
    for (const option of ["", "CASCADE", "SET NULL", "RESTRICT", "NO ACTION"]) {
      select.appendChild(new Option(option === "" ? "(none)" : option, option));
    }
    select.value = draft.onDelete;
    select.addEventListener("change", () => {
      draft.onDelete = select.value;
      changed();
    });
    cell.appendChild(select);
    return cell;
  }
  function splitCsv(value) {
    return value.split(",").map((part) => part.trim()).filter((part) => part !== "");
  }
  function buildRow(draft, index) {
    const row = document.createElement("tr");
    if (draft.drop) {
      row.classList.add("dropped");
    }
    row.appendChild(buildActions(draft, index));
    row.appendChild(textCell(draft.name, (value) => draft.name = value));
    appendTypeCells(row, draft);
    row.appendChild(checkCell(draft.isNullable, (value) => draft.isNullable = value));
    row.appendChild(checkCell(draft.isPrimaryKey, (value) => draft.isPrimaryKey = value));
    row.appendChild(checkCell(draft.isAutoIncrement, (value) => draft.isAutoIncrement = value));
    row.appendChild(textCell(draft.defaultValue ?? "", (value) => draft.defaultValue = value === "" ? null : value));
    return row;
  }
  function appendTypeCells(row, draft) {
    const parsed = splitType(draft.type);
    const list = flatTypes(driver);
    const typeCell = document.createElement("td");
    const select = document.createElement("select");
    for (const group of TYPE_GROUPS[driver]) {
      const optgroup = document.createElement("optgroup");
      optgroup.label = group.label;
      for (const type of group.types) {
        optgroup.appendChild(new Option(type, type));
      }
      select.appendChild(optgroup);
    }
    if (parsed.base && !list.includes(parsed.base)) {
      select.appendChild(new Option(parsed.base, parsed.base));
    }
    select.value = parsed.base || list[0];
    typeCell.appendChild(select);
    const sizeCell = document.createElement("td");
    const sizeInput = document.createElement("input");
    sizeInput.value = parsed.size;
    sizeInput.placeholder = "size";
    sizeCell.appendChild(sizeInput);
    const update = () => {
      draft.type = combineType(select.value, sizeInput.value);
      changed();
    };
    select.addEventListener("change", update);
    sizeInput.addEventListener("input", update);
    row.appendChild(typeCell);
    row.appendChild(sizeCell);
  }
  function splitType(type) {
    const match = /^(.*?)\(([^)]*)\)/.exec(type.trim());
    if (match) {
      return { base: match[1].trim().toLowerCase(), size: match[2].trim() };
    }
    return { base: type.trim().toLowerCase(), size: "" };
  }
  function combineType(base, size) {
    return size.trim() !== "" ? `${base}(${size})` : base;
  }
  function buildActions(draft, index) {
    const cell = document.createElement("td");
    cell.className = "actions";
    const button = document.createElement("button");
    button.textContent = draft.drop ? "\u21BA" : "\xD7";
    button.title = draft.drop ? "Keep column" : "Remove column";
    button.addEventListener("click", () => {
      if (mode === "modify" && draft.originalName) {
        draft.drop = !draft.drop;
      } else {
        columns.splice(index, 1);
      }
      render();
    });
    cell.appendChild(button);
    return cell;
  }
  function textCell(value, onChange) {
    const cell = document.createElement("td");
    const input = document.createElement("input");
    input.value = value;
    input.spellcheck = false;
    input.addEventListener("input", () => {
      onChange(input.value);
      changed();
    });
    cell.appendChild(input);
    return cell;
  }
  function checkCell(value, onChange) {
    const cell = document.createElement("td");
    cell.className = "check";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = value;
    input.addEventListener("change", () => {
      onChange(input.checked);
      changed();
    });
    cell.appendChild(input);
    return cell;
  }
  function byId(id) {
    const found = document.getElementById(id);
    if (!found) {
      throw new Error(`Missing element #${id}`);
    }
    return found;
  }
})();
//# sourceMappingURL=designer.js.map
