const api = require("../../utils/api");

Page({
  data: { classId: "", rows: [], role: "coach", keepSource: true, loading: true, error: "", actingId: "" },
  onLoad(options) { this.setData({ classId: options.classId || "" }); },
  onShow() { this.load(); },
  async load() {
    this.setData({ loading: true, error: "" });
    try {
      const [context, rows] = await Promise.all([api.call("getContext"), api.call("listEliteSelections")]);
      const filtered = this.data.classId ? rows.filter((item) => item.targetEliteClassId === this.data.classId) : rows;
      this.setData({ role: context.user.role, rows: filtered, loading: false });
    } catch (error) { this.setData({ loading: false, error: error.message || "推荐记录加载失败" }); }
  },
  keep(event) { this.setData({ keepSource: event.detail.value }); },
  openGrowth(event) { wx.navigateTo({ url: `/pages/growth-profile/index?studentId=${event.currentTarget.dataset.student}` }); },
  review(event) {
    const id = event.currentTarget.dataset.id;
    const approved = event.currentTarget.dataset.approved === true || event.currentTarget.dataset.approved === "true";
    wx.showModal({ title: approved ? "确认进入精英队" : "暂不入选", editable: true, placeholderText: "审核备注", success: async (modal) => { if (!modal.confirm) return; await this.submit(id, approved, modal.content || (approved ? "同意入队" : "暂不入选"), false); } });
  },
  async submit(id, approved, reviewRemark, confirmCapacity) {
    this.setData({ actingId: id });
    try {
      const result = await api.call("reviewEliteSelection", { id, approved, reviewRemark, keepSource: this.data.keepSource, confirmCapacity });
      if (result.requiresConfirmation) return wx.showModal({ title: "超出标准容量", content: result.message, confirmText: "确认通过", success: (modal) => { if (modal.confirm) this.submit(id, approved, reviewRemark, true); } });
      wx.showToast({ title: approved ? "已确认入队" : "已记录结果" });
      this.load();
    } catch (error) { wx.showToast({ title: error.message || "审核失败", icon: "none" }); }
    finally { this.setData({ actingId: "" }); }
  }
});
