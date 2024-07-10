const { Notification } = require("electron/main");
const HID = require("node-hid");

module.exports = class HyperX {
  static VENDOR_ID = 2385;
  static PRODUCT_ID = 5923;

  constructor(tray, icons, updateDelay, debug = false, verbose = false) {
    this.tray = tray;
    this.icons = icons;
    this.updateDelay = updateDelay;
    this.debug = debug;
    this.verbose = verbose;
  }

  async init() {
    const platform = process.platform;
    if (platform == "win32" || platform == "win64") {
      HID.setDriverType("libusb");
    }

    // if (platform == "darwin") {
    //   HID.setDriverType('libusb')
    // }

    this.hidDevices = (await HID.devicesAsync()).filter(
      (d) =>
        d.vendorId === HyperX.VENDOR_ID && d.productId === HyperX.PRODUCT_ID
    );

    if (this.hidDevices.length === 0) {
      this.tray.setImage(this.icons["no_connection"]);
      this.tray.setToolTip("Device not connected...");
    }

    // 12
    // 65472
    // 65424
    // 65280
    this.hidDevice = this.hidDevices.find(
      (d) => d.usagePage === 65424 && d.usage === 771
    );

    this.device = await HID.HIDAsync.open(this.hidDevice.path);
  }

  async runStatusUpdaterInterval() {
    const _this = this;
    await this.sendBatteryUpdateBuffer(_this);
    this.updateInterval = setInterval(async () => { await this.sendBatteryUpdateBuffer(_this); }, this.updateDelay * 60 * 1000);
  }

  async sendBatteryUpdateBuffer(_this) {
    try {
      const buffer = Buffer.from([
        0x21, 0xff, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      ]);
      this.device.write(buffer);
    } catch (e) {
      console.error(e);
    }
  }

  getBatteryPercentage(charge_state, value) {
    // const status0x0e = [
    //   { min: 0, max: 89, value: 10 },
    //   { min: 90, max: 119, value: 15 },
    //   { min: 120, max: 148, value: 20 },
    //   { min: 149, max: 159, value: 25 },
    //   { min: 160, max: 169, value: 30 },
    //   { min: 170, max: 179, value: 35 },
    //   { min: 180, max: 189, value: 40 },
    //   { min: 190, max: 199, value: 45 },
    //   { min: 200, max: 209, value: 50 },
    //   { min: 210, max: 219, value: 55 },
    //   { min: 220, max: 229, value: 60 },
    //   { min: 230, max: 239, value: 65 },
    //   { min: 240, max: 249, value: 70 },
    //   { min: 250, max: 259, value: 75 },
    // ];
    // const status0x0f = [
    //   { min: 0, max: 19, value: 70 },
    //   { min: 20, max: 49, value: 75 },
    //   { min: 50, max: 69, value: 80 },
    //   { min: 70, max: 99, value: 85 },
    //   { min: 100, max: 119, value: 90 },
    //   { min: 120, max: 129, value: 95 },
    //   { min: 130, max: 255, value: 100 },
    // ];
    
    //14
    if (charge_state == 0x0e) {
      const batteryPercentage = Math.round((value / 510) * 100);
      return batteryPercentage;
      // for (let status of status0x0e) {
      //   if (value >= status.min && value <= status.max) {
      //     return status.value;
      //   }
      // }
    } else if (charge_state == 0x0f) { //15
      const batteryPercentage = Math.round(((value + 255) / 510) * 100);
      return batteryPercentage;
      // for (let status of status0x0f) {
      //   if (value >= status.min && value <= status.max) {
      //     return status.value;
      //   }
      // }
    }

    //16
    if (charge_state == 0x10) {
      if (value >= 20) {
        const batteryPercentage = Math.round((value / 384) * 100);
        return batteryPercentage;
      }
      //full battery
      return 100;
    }

    //17
    if (charge_state == 0x11) {
      if (value >= 20) {
        //255+129
        const batteryPercentage = Math.round(((value + 255) / 384) * 100);
        return batteryPercentage;
      }
      //full battery
      return 100;
    }
  }

  async runListener() {
    this.hidDevices.map(async (deviceInfo) => {
      if(deviceInfo.usagePage !== 65424 && deviceInfo.usage !== 771)
        return;

      const deviceName = "Device connected...\n" + deviceInfo.product; // + " - " + deviceInfo.manufacturer;
      this.tray.setToolTip(deviceName);
      // const device = await HID.HIDAsync.open(deviceInfo.path);

      this.device.on("error", (err) => console.log(err));
      this.device.on("data", (data) => {
        if (this.debug && this.verbose) {
          console.log(new Date(), data, `length: ${data.length} hex: ${data.length.toString(16)}:`);
          for (let byte of data.slice(0, data.length)) {
            console.log(byte);
          }
        }

        switch (data.length) {
          case 20:
            let batteryPercentage = 0
            
            batteryPercentage = this.getBatteryPercentage(data[3], data[4]);
            if (this.debug) console.log("Buffer charge state: " + data[3] + " buffer number: " + data[4] + " Battery percentage: " + batteryPercentage + "%");
            this.tray.setToolTip(deviceName + "\nBattery:" + batteryPercentage + "%");
            this.tray.setTitle(batteryPercentage + "%");

            if (data[3] == 0x10 || data[3] == 0x11) {
              this.tray.setImage(this.icons["charging"].resize({ width: 20, height: 20 }));
              break;
            }
            if (batteryPercentage < 5) {
              if (this.debug) console.log("Battery empty");
              this.tray.setImage(this.icons["empty"].resize({ width: 20, height: 20 }));
            } else if (batteryPercentage < 45) {
              if (this.debug) console.log("Battery low");
              this.tray.setImage(this.icons["low"].resize({ width: 20, height: 20 }));
            } else if (batteryPercentage < 55) {
              if (this.debug) console.log("Battery half");
              this.tray.setImage(this.icons["half"].resize({ width: 20, height: 20 }));
            } else if (batteryPercentage < 95) {
              if (this.debug) console.log("Battery high");
              this.tray.setImage(this.icons["high"].resize({ width: 20, height: 20 }));
            } else if (batteryPercentage > 95) {
              if (this.debug) console.log("Battery full");
              this.tray.setImage(this.icons["full"].resize({ width: 20, height: 20 }));
            }
            break;
          case 2:
            if (data[0] == 0x64) {
              if (data[1] == 0x01) {
                if (this.debug) console.log("Device connected");
                new Notification({
                  title: deviceInfo.product,
                  body: "Device connected",
                }).show();
                this.runStatusUpdaterInterval();
              } else if (data[1] == 0x03) {
                if (this.debug) console.log("Device disconnected");
                this.tray.setImage(this.icons["no_connection"].resize({ width: 20, height: 20 }));
                this.tray.setToolTip("Device not connected...");
                clearInterval(this.updateInterval);
                new Notification({
                  title: deviceInfo.product,
                  body: "Device disconnected",
                }).show();
              }
            }
            if (data[0] == 0x65) {
              if (data[1] == 0x04) {
                console.log("Microphone muted");
                new Notification({
                  title: deviceInfo.product,
                  body: "Microphone muted",
                }).show();
              } else {
                console.log("Microphone unmuted");
                new Notification({
                  title: deviceInfo.product,
                  body: "Microphone unmuted",
                }).show();
              }
            }
            break;
          case 5:
            if (data[1] == 0x01) {
              console.log("Volume up");
              break;
            } else if (data[1] == 0x02) {
              console.log("Volume down");
              break;
            }
            break;
          default:
            break;
        }
      });
    });
  }

  stop() {
    this.hidDevices.map((deviceInfo) => {
      if(deviceInfo.usagePage !== 65424 && deviceInfo.usage !== 771)
        return;
      this.device.close();
      clearInterval(this.updateInterval);
    });
  }
};
