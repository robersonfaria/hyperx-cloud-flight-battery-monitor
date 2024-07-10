const { app, BrowserWindow, Menu, Tray } = require('electron')
const { nativeImage } = require('electron/common');
const path = require('path')
const Store = require('electron-store');
const HyperX = require('./assets/js/classes/HyperX.js')

const store = new Store();

if (require('electron-squirrel-startup')) {
  app.quit()
}

let tray = null
let icons = []

app.whenReady().then(async () => {
  icons['no_connection'] = nativeImage.createFromPath(path.join(__dirname, 'assets/img/png/disconnected.png'))
  icons['full'] = nativeImage.createFromPath(path.join(__dirname, 'assets/img/png/full-battery.png'))
  icons['half'] = nativeImage.createFromPath(path.join(__dirname, 'assets/img/png/half-battery.png'))
  icons['low'] = nativeImage.createFromPath(path.join(__dirname, 'assets/img/png/low-battery.png'))
  icons['high'] = nativeImage.createFromPath(path.join(__dirname, 'assets/img/png/battery-high.png'))
  icons['empty'] = nativeImage.createFromPath(path.join(__dirname, 'assets/img/png/empty-battery.png'))
  icons['charging'] = nativeImage.createFromPath(path.join(__dirname, 'assets/img/png/charging.png'))

  tray = new Tray(icons['no_connection'].resize({ width: 32, height: 32 }))
  tray.setToolTip('Device not connected...')

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Quit', type: 'normal', click: () => { app.quit() }}
  ])
  tray.setContextMenu(contextMenu)
  app.dock.setIcon(path.join(__dirname, 'assets/img/png/logo.png'))

  initConfig()
  await run()
})

let hyperX = null
async function run() {
  let updateDelay = store.get('updateDelay')
  hyperX = new HyperX(tray, icons, updateDelay, true)
  await hyperX.init()
  await hyperX.runStatusUpdaterInterval()
  await hyperX.runListener()
}

function initConfig() {
  //if (store.get('updateDelay') === undefined) {
    store.set('updateDelay', 15);
  //}
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})


app.on('before-quit', () => {
  hyperX.stop()
  tray.destroy()
});
