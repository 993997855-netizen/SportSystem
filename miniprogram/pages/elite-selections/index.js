const api = require("../../utils/api");

Page({
  data: { classId: "", rows: [], role: "coach", filter: "ALL", keepSource: true, loading: true, actingId: "" },
  onLoad(options) { this.setData({ classId: options.classId || "" }); }, onShow() { this.load(); },
  async load() { const [context, rows] = await Promise.all([api.call("getContext"), api.call("listEliteSelections")]); const filtered = this.data.classId ? rows.filter((item) => item.targetEliteClassId === this.data.classId) : rows; this.setData({ role: context.user.role, rows: filtered, loading: false }); },
  keep(event) { this.setData({ keepSource: event.detail.value }); },
  review(event) { const id = event.currentTarget.dataset.id, approved = event.currentTarget.dataset.approved === true || event.currentTarget.dataset.approved === "true"; wx.showModal({ title: approved ? "确认进入精英队" : "暂不入选", editable: true, placeholderText: "审核备注", success: async (modal) => { if (!modal.confirm) return; await this.submit(id, approved, modal.content || (approved ? "同意入队" : "暂不入选"), false); } }); },
  async submit(id, approved, reviewRemark, confirmCapacity) { this.setData({ actingId: id }); try { const result = await api.call("reviewEliteSelection", { id, approved, reviewRemark, keepSource: this.data.keepSource, confirmCapacity }); if (result.requiresConfirmation) return wx.showModal({ title: "超出标准容量", content: result.message, confirmText: "确认通过", success: (modal) => { if (modal.confirm) this.submit(id, approved, reviewRemark, true); } }); wx.showToast({ title: approved ? "已确认入队" : "已记录结果" }); this.load(); } finally { this.setData({ actingId: "" }); } }
});
