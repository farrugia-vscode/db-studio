"use strict";
(() => {
  // src/webview/designer.ts
  var api = acquireVsCodeApi();
  var TYPES = {
    mysql: [
      "int",
      "bigint",
      "tinyint",
      "smallint",
      "mediumint",
      "decimal",
      "float",
      "double",
      "boolean",
      "varchar",
      "char",
      "text",
      "tinytext",
      "mediumtext",
      "longtext",
      "json",
      "date",
      "datetime",
      "timestamp",
      "time",
      "year",
      "binary",
      "varbinary",
      "blob"
    ],
    postgres: [
      "integer",
      "bigint",
      "smallint",
      "serial",
      "bigserial",
      "numeric",
      "real",
      "double precision",
      "boolean",
      "varchar",
      "char",
      "text",
      "json",
      "jsonb",
      "uuid",
      "date",
      "timestamp",
      "timestamptz",
      "time",
      "bytea"
    ]
  };
  var SIZEABLE = /* @__PURE__ */ new Set(["varchar", "char", "varbinary", "binary", "decimal", "numeric"]);
  var mode = "create";
  var driver = "mysql";
  var columns = [];
  var body = byId("columnsBody");
  var tableNameInput = byId("tableName");
  var tableNameWrap = byId("tableNameWrap");
  var applyButton = byId("apply");
  var sqlEl = byId("sql");
  var notice = byId("notice");
  byId("addColumn").addEventListener("click", addColumn);
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
      columns = message.columns;
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
    api.postMessage({ type: kind, table: tableNameInput.value.trim(), columns });
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
      type: TYPES[driver][0],
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
    changed();
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
    const list = TYPES[driver];
    const typeCell = document.createElement("td");
    const select = document.createElement("select");
    for (const type of list) {
      select.appendChild(new Option(type, type));
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
    sizeInput.disabled = !SIZEABLE.has(select.value);
    sizeCell.appendChild(sizeInput);
    const update = () => {
      sizeInput.disabled = !SIZEABLE.has(select.value);
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
    return SIZEABLE.has(base) && size.trim() !== "" ? `${base}(${size})` : base;
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
