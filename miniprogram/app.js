App({
  onLaunch() {
    this.globalData = {
      // 填入云开发环境 ID 后自动切换为多人共享的云端数据。
      // 留空时使用本地演示数据，便于直接在开发者工具预览。
      env: "",
      dataMode: "local",
      previewRole: wx.getStorageSync("previewRole") || "admin",
    };

    if (wx.cloud && this.globalData.env) {
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: true,
      });
      this.globalData.dataMode = "cloud";
    }
  },
});
