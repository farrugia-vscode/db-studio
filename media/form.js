"use strict";
(() => {
  // src/webview/form.ts
  var api = acquireVsCodeApi();
  var SWATCHES = ["#f14c4c", "#f5a623", "#f8e71c", "#4ec94e", "#4aa3ff", "#9b59b6", "#e879c0", "#8a8a8a"];
  var DEFAULT_PORTS = { mysql: "3306", postgres: "5432" };
  var form = byId("form");
  var nameInput = byId("name");
  var iconInput = byId("icon");
  var driverPicker = byId("driverPicker");
  var hostInput = byId("host");
  var portInput = byId("port");
  var userInput = byId("user");
  var databaseInput = byId("database");
  var passwordInput = byId("password");
  var colorInput = byId("color");
  var swatches = byId("swatches");
  var clearColorButton = byId("clearColor");
  var cancelButton = byId("cancel");
  var testButton = byId("test");
  var result = byId("result");
  var useColor = true;
  var selectedDriver = "mysql";
  buildSwatches();
  for (const button of driverPicker.querySelectorAll(".driver-option")) {
    button.addEventListener("click", () => setDriver(button.dataset.driver));
  }
  colorInput.addEventListener("input", () => setUseColor(true));
  clearColorButton.addEventListener("click", () => setUseColor(false));
  cancelButton.addEventListener("click", () => api.postMessage({ type: "cancel" }));
  testButton.addEventListener("click", test);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submit();
  });
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (message.type === "init") {
      applyInit(message.isEdit, message.connection);
      return;
    }
    if (message.type === "testResult") {
      showResult(message.ok ? "ok" : "error", message.message);
      testButton.disabled = false;
    }
  });
  api.postMessage({ type: "ready" });
  function applyInit(isEdit, connection) {
    nameInput.value = connection.name ?? "";
    iconInput.value = connection.icon ?? "";
    setDriver(connection.driver ?? "mysql");
    hostInput.value = connection.host ?? "127.0.0.1";
    portInput.value = connection.port !== void 0 ? String(connection.port) : DEFAULT_PORTS[selectedDriver];
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
  function readConnection() {
    return {
      name: nameInput.value.trim(),
      driver: selectedDriver,
      host: hostInput.value.trim(),
      port: portInput.value ? Number(portInput.value) : void 0,
      user: userInput.value.trim(),
      database: databaseInput.value.trim() || void 0,
      color: useColor ? colorInput.value : void 0,
      icon: iconInput.value.trim() || void 0
    };
  }
  function submit() {
    api.postMessage({ type: "submit", connection: readConnection(), password: passwordInput.value });
  }
  function test() {
    testButton.disabled = true;
    showResult("pending", "Testing\u2026");
    api.postMessage({ type: "test", connection: readConnection(), password: passwordInput.value });
  }
  function showResult(state, message) {
    result.textContent = message;
    result.className = `result ${state}`;
  }
  function setUseColor(next) {
    useColor = next;
    colorInput.style.opacity = next ? "1" : "0.35";
    clearColorButton.classList.toggle("active", !next);
  }
  function setDriver(driver) {
    selectedDriver = driver;
    for (const button of driverPicker.querySelectorAll(".driver-option")) {
      button.classList.toggle("active", button.dataset.driver === driver);
    }
    if (portInput.value === "") {
      portInput.value = DEFAULT_PORTS[driver];
    }
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
