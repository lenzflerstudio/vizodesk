const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow;
let serverProcess;

function startServer() {
  if (isDev) {
    // In dev, server is started separately
    console.log('Dev mode: Use "npm run dev:server" to start the server manually');
    return;
  }

  // In production, start bundled server
  const serverPath = path.join(process.resourcesPath, 'server', 'start.js');
  const dbPath = path.join(app.getPath('userData'), 'vizodesk.db');

  serverProcess = spawn(process.execPath, [serverPath], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '3001',
      DB_PATH: dbPath,
    },
    cwd: path.join(process.resourcesPath, 'server'),
  });

  serverProcess.stdout.on('data', (data) => console.log('Server:', data.toString()));
  serverProcess.stderr.on('data', (data) => console.error('Server error:', data.toString()));

  serverProcess.on('close', (code) => {
    console.log('Server exited with code', code);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f0f13',
    show: false,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    // mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open external links in browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// IPC handlers
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('open-external', (_, url) => shell.openExternal(url));

app.whenReady().then(() => {
  startServer();
  // Small delay in production to let server start
  const delay = isDev ? 0 : 2000;
  setTimeout(createWindow, delay);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (serverProcess) serverProcess.kill();
});
