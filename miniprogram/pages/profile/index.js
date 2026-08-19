const api = require("../../utils/api");
const { roleLabels } = require("../../utils/format");

Page({
  data: { context: null, roleLabel: "", modeLabel: "", inviteCode: "", loading: true, error: "", binding: false, roles: [{ value: "admin", label: "管理员" }, { value: "coach", label: "教练员" }, { value: "parent", label: "家长" }] },
  onShow() { this.load(); },
  async load() {
    this.setData({ loading: true, error: "" });
    try {
      const context = await api.call("getContext");
      this.setData({ context, roleLabel: roleLabels[context.user.role], modeLabel: context.mode === "local" ? "本地演示" : "云端共享", loading: false });
    } catch (error) { this.setData({ loading: false, error: "账号信息加载失败" }); }
  },
  switchRole(event) {
    if (this.data.context.mode !== "local") return;
    const role = event.currentTarget.dataset.role;
    getApp().globalData.previewRole = role;
    wx.setStorageSync("previewRole", role);
    this.load();
    wx.showToast({ title: `已切换为${roleLabels[role]}`, icon: "none" });
  },
  renewals() { wx.navigateTo({ url: "/pages/renewals/index" }); },
  sessions() { wx.switchTab({ url: "/pages/sessions/index" }); },
  leaves() { wx.navigateTo({ url: "/pages/leave-requests/index" }); },
  operations() { wx.navigateTo({ url: "/pages/operations/index" }); },
  classes() { wx.navigateTo({ url: "/pages/classes/index" }); },
  inviteInput(event) { this.setData({ inviteCode: event.detail.value }); },
  async claimInvite() {
    if (this.data.binding) return;
    if (this.data.inviteCode.length !== 6) { wx.showToast({ title: "请输入6位邀请码", icon: "none" }); return; }
    this.setData({ binding: true });
    try {
      await api.call("claimInvite", { code: this.data.inviteCode });
      wx.showToast({ title: "身份绑定成功" }); this.setData({ inviteCode: "" }); this.load();
    } finally { this.setData({ binding: false }); }
  },
  reset() {
    wx.showModal({
      title: "重置演示数据",
      content: "录入和点名产生的本地数据将恢复为初始状态。",
      success: async (result) => {
        if (!result.confirm) return;
        await api.call("resetDemo"); wx.showToast({ title: "已重置" });
      }
    });
  }
});
