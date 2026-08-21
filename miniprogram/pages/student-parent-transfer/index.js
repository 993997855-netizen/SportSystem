const api = require("../../utils/api");

Page({
  data: { studentId: "", ownership: null, parentIndex: 0, reason: "", loading: true, submitting: false },
  onLoad(options) { this.setData({ studentId: options.studentId || "" }); },
  onShow() { if (this.data.studentId) this.load(); },
  async load() {
    this.setData({ loading: true });
    try {
      const ownership = await api.call("getStudentOwnership", { studentId: this.data.studentId });
      const index = Math.max(0, ownership.parents.findIndex((item) => item.id !== ownership.ownerParentUserId));
      this.setData({ ownership, parentIndex: index, loading: false });
    } catch (error) { this.setData({ loading: false }); wx.showToast({ title: error.message || "加载失败", icon: "none" }); }
  },
  parent(event) { this.setData({ parentIndex: Number(event.detail.value) }); },
  reason(event) { this.setData({ reason: event.detail.value }); },
  async transfer() {
    if (this.data.submitting) return;
    const target = this.data.ownership.parents[this.data.parentIndex];
    if (!target) return wx.showToast({ title: "请选择目标家长", icon: "none" });
    if (!this.data.reason.trim()) return wx.showToast({ title: "请填写转移原因", icon: "none" });
    const preview = await api.call("transferStudentParent", { studentId: this.data.studentId, newParentUserId: target.id });
    if (preview.unchanged) return wx.showToast({ title: "当前已是该家长", icon: "none" });
    wx.showModal({
      title: "确认转移家长归属",
      content: preview.message,
      confirmText: "确认转移",
      confirmColor: "#b42318",
      success: async (result) => {
        if (!result.confirm) return;
        this.setData({ submitting: true });
        try {
          await api.call("transferStudentParent", { studentId: this.data.studentId, newParentUserId: target.id, reason: this.data.reason, confirmTransfer: true });
          wx.showToast({ title: "归属已转移" });
          this.load();
        } finally { this.setData({ submitting: false }); }
      },
    });
  },
});
