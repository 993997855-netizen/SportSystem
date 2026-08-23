const api = require("../../utils/api");
Page({
  data: { loading: true, error: "", data: null },
  onShow() { this.load(); },
  async load() { this.setData({ loading: true, error: "" }); try { this.setData({ data: await api.call("getFinanceDashboard"), loading: false }); } catch (error) { this.setData({ loading: false, error: "经营数据加载失败" }); } },
  orders() { wx.navigateTo({ url: "/pages/renewals/index" }); }, products() { wx.navigateTo({ url: "/pages/products/index" }); }, adjustment() { wx.navigateTo({ url: "/pages/lesson-adjustment/index" }); }
});
