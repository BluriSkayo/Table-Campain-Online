const { app, BrowserWindow } = require("electron");
const path = require("path");

function crearVentana() {
  const ventana = new BrowserWindow({
    width: 1366,
    height: 800,
    minWidth: 1000,
    minHeight: 600,
    title: "Mesa de Rol",
    backgroundColor: "#0d0d1a",
    icon: path.resolve(__dirname, "src", "icon.ico"),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    }
  });
  ventana.loadFile(path.join(__dirname, "src/index.html"));
  // ventana.webContents.openDevTools();
}

app.whenReady().then(crearVentana);
app.on("window-all-closed", () => app.quit());
