"use strict";
(() => {
  // src/webview/form.ts
  var api = acquireVsCodeApi();
  var DEFAULT_PORTS = { mysql: "3306", postgres: "5432", sqlite: "" };
  var form = byId("form");
  var nameInput = byId("name");
  var colorPicker = byId("colorPicker");
  var driverPicker = byId("driverPicker");
  var hostInput = byId("host");
  var portInput = byId("port");
  var userInput = byId("user");
  var databaseInput = byId("database");
  var filePathInput = byId("filePath");
  var passwordInput = byId("password");
  var readOnlyInput = byId("isReadOnly");
  var serverFields = ["serverAddress", "userField", "databaseField", "passwordField"].map((id) => byId(id));
  var filePathField = byId("filePathField");
  var formTitle = byId("formTitle");
  var formSubtitle = byId("formSubtitle");
  var browseButton = byId("browse");
  var cancelButton = byId("cancel");
  var testButton = byId("test");
  var result = byId("result");
  var selectedDriver = "mysql";
  var selectedIcon = "";
  for (const button of driverPicker.querySelectorAll(".driver-option")) {
    button.addEventListener("click", () => setDriver(button.dataset.driver));
  }
  for (const swatch of colorPicker.querySelectorAll(".color-swatch")) {
    swatch.addEventListener("click", () => setIcon(swatch.dataset.icon ?? ""));
  }
  browseButton.addEventListener("click", () => api.postMessage({ type: "browse" }));
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
      return;
    }
    if (message.type === "filePicked") {
      filePathInput.value = message.filePath;
    }
  });
  api.postMessage({ type: "ready" });
  function applyInit(isEdit, connection) {
    formTitle.textContent = isEdit ? `Edit ${connection.name ?? "connection"}` : "New connection";
    formSubtitle.textContent = isEdit ? "Changes take effect the next time the connection is opened." : "Connections are saved with the open folder; the password goes to the OS secret storage.";
    nameInput.value = connection.name ?? "";
    setIcon(connection.icon ?? "");
    setDriver(connection.driver ?? "mysql");
    hostInput.value = connection.host ?? "127.0.0.1";
    portInput.value = connection.port !== void 0 ? String(connection.port) : DEFAULT_PORTS[selectedDriver];
    userInput.value = connection.user ?? "";
    databaseInput.value = connection.database ?? "";
    filePathInput.value = connection.filePath ?? "";
    readOnlyInput.checked = connection.isReadOnly ?? false;
    passwordInput.value = "";
    passwordInput.placeholder = isEdit ? "leave blank to keep current" : "";
  }
  function readConnection() {
    return {
      name: nameInput.value.trim(),
      driver: selectedDriver,
      host: hostInput.value.trim(),
      port: portInput.value ? Number(portInput.value) : void 0,
      user: userInput.value.trim(),
      database: databaseInput.value.trim() || void 0,
      filePath: filePathInput.value.trim() || void 0,
      icon: selectedIcon || void 0,
      isReadOnly: readOnlyInput.checked || void 0
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
    result.className = `banner ${state}`;
  }
  function setIcon(icon) {
    selectedIcon = icon;
    for (const swatch of colorPicker.querySelectorAll(".color-swatch")) {
      const isActive = (swatch.dataset.icon ?? "") === icon;
      swatch.classList.toggle("active", isActive);
      swatch.setAttribute("aria-checked", String(isActive));
    }
  }
  function setDriver(driver) {
    selectedDriver = driver;
    for (const button of driverPicker.querySelectorAll(".driver-option")) {
      button.classList.toggle("active", button.dataset.driver === driver);
    }
    const isFileBased = driver === "sqlite";
    for (const field of serverFields) {
      field.hidden = isFileBased;
    }
    filePathField.hidden = !isFileBased;
    hostInput.required = !isFileBased;
    userInput.required = !isFileBased;
    filePathInput.required = isFileBased;
    if (portInput.value === "") {
      portInput.value = DEFAULT_PORTS[driver];
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
