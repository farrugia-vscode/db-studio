"use strict";
(() => {
  // src/webview/form.ts
  var api = acquireVsCodeApi();
  var SWATCHES = ["#f14c4c", "#f5a623", "#f8e71c", "#4ec94e", "#4aa3ff", "#9b59b6", "#e879c0", "#8a8a8a"];
  var DEFAULT_PORTS = { mysql: "3306", postgres: "5432" };
  var form = byId("form");
  var nameInput = byId("name");
  var driverSelect = byId("driver");
  var hostInput = byId("host");
  var portInput = byId("port");
  var userInput = byId("user");
  var databaseInput = byId("database");
  var passwordInput = byId("password");
  var colorInput = byId("color");
  var swatches = byId("swatches");
  var clearColorButton = byId("clearColor");
  var cancelButton = byId("cancel");
  var useColor = true;
  buildSwatches();
  driverSelect.addEventListener("change", () => {
    if (portInput.value === "") {
      portInput.value = DEFAULT_PORTS[driverSelect.value];
    }
  });
  colorInput.addEventListener("input", () => setUseColor(true));
  clearColorButton.addEventListener("click", () => setUseColor(false));
  cancelButton.addEventListener("click", () => api.postMessage({ type: "cancel" }));
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submit();
  });
  window.addEventListener("message", (event) => {
    if (event.data.type === "init") {
      applyInit(event.data.isEdit, event.data.connection);
    }
  });
  api.postMessage({ type: "ready" });
  function applyInit(isEdit, connection) {
    nameInput.value = connection.name ?? "";
    nameInput.readOnly = isEdit;
    driverSelect.value = connection.driver ?? "mysql";
    hostInput.value = connection.host ?? "127.0.0.1";
    portInput.value = connection.port !== void 0 ? String(connection.port) : DEFAULT_PORTS[driverSelect.value];
    userInput.value = connection.user ?? "";
    databaseInput.value = connection.database ?? "";
    passwordInput.value = "";
    passwordInput.placeholder = isEdit ? "leave blank to keep current" : "";
    if (connection.color) {
      colorInput.value = connection.color;
      setUseColor(true);
    } else {
      setUseColor(!isEdit);
    }
  }
  function submit() {
    const connection = {
      name: nameInput.value.trim(),
      driver: driverSelect.value,
      host: hostInput.value.trim(),
      port: portInput.value ? Number(portInput.value) : void 0,
      user: userInput.value.trim(),
      database: databaseInput.value.trim() || void 0,
      color: useColor ? colorInput.value : void 0
    };
    api.postMessage({ type: "submit", connection, password: passwordInput.value });
  }
  function setUseColor(next) {
    useColor = next;
    colorInput.style.opacity = next ? "1" : "0.35";
    clearColorButton.classList.toggle("active", !next);
  }
  function buildSwatches() {
    for (const color of SWATCHES) {
      const swatch = document.createElement("button");
      swatch.type = "button";
      swatch.className = "swatch";
      swatch.style.background = color;
      swatch.title = color;
      swatch.addEventListener("click", () => {
        colorInput.value = color;
        setUseColor(true);
      });
      swatches.appendChild(swatch);
    }
  }
  function byId(id) {
    const found = document.getElementById(id);
    if (!found) {
      throw new Error(`Missing element #${id}`);
    }
    return found;
  }
})();
//# sourceMappingURL=form.js.map
