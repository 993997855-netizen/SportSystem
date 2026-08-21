const api = require("../../utils/api");

Page({
  data: { loading: true, report: null },
  onShow() { this.load(); },
  onPullDownRefresh() { this.load(); },
  async load() {
    this.setData({ loading: true });
    try { this.setData({ report: await api.call("checkParentOwnershipConsistency"), loading: false }); }
    catch (error) { this.setData({ loading: false }); wx.showToast({ title: error.message || "检查失败", icon: "none" }); }
    finally { wx.stopPullDownRefresh(); }
  },
});
