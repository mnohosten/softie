import { app, BrowserWindow } from 'electron';
import path from 'path';

async function createWindow(port: number, isDev: boolean) {
  const win = new BrowserWindow({
    width: 1400, height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });
  const url = isDev ? `http://localhost:3848` : `http://localhost:${port}`;
  win.loadURL(url);
  if (isDev) win.webContents.openDevTools();
}

app.whenReady().then(async () => {
  // ELECTRON_DEV=true only when running `npm run electron:dev` (Vite HMR active)
  const isDev = process.env.ELECTRON_DEV === 'true';
  const port = 3847;
  // process.argv[2] is the working directory passed from the CLI (softie command)
  const projectDir = process.argv[2] || process.cwd();

  // Dynamic import bridges CJS main process to ESM server module
  const { startServer } = await import('../dist/server/index.js');
  const uiDistPath = path.join(app.getAppPath(), 'ui', 'dist');
  await startServer({ projectDir, port, isDev: false, uiDistPath, autoResume: true });

  await createWindow(port, isDev);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(port, isDev);
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
