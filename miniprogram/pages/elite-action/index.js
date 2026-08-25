const api = require("../../utils/api");

Page({
  data: { studentId: "", fromClassId: "", role: "coach", classes: [], classIndex: 0, reason: "", keepSource: true, growth: null, saving: false, loading: true, error: "" },
  async onLoad(options) {
    this.setData({ studentId: options.studentId || "", fromClassId: options.fromClassId || "", loading: true, error: "" });
    try {
      const [context, meta, growth] = await Promise.all([api.call("getContext"), api.call("getClassMeta"), api.call("getEliteGrowthSummary", { studentId: options.studentId || "" })]);
      this.setData({ role: context.user.role, classes: meta.eliteClasses, growth, loading: false });
      wx.setNavigationBarTitle({ title: context.user.role === "admin" ? "晋升精英队" : "推荐进入精英队" });
    } catch (error) { this.setData({ loading: false, error: error.message || "选拔信息加载失败" }); }
  },
  classChange(event) { this.setData({ classIndex: Number(event.detail.value) }); },
  field(event) { this.setData({ reason: event.detail.value }); },
  keep(event) { this.setData({ keepSource: event.detail.value }); },
  submit() { this.save(false); },
  async save(confirmCapacity) {
    const target = this.data.classes[this.data.classIndex];
    if (!target || !this.data.reason.trim() || this.data.saving) { if (!target) wx.showToast({ title: "暂无可选精英队", icon: "none" }); else if (!this.data.reason.trim()) wx.showToast({ title: "请填写推荐或晋升理由", icon: "none" }); return; }
    this.setData({ saving: true });
    try {
      const action = this.data.role === "admin" ? "promoteToElite" : "recommendElite";
      const payload = this.data.role === "admin" ? { studentId: this.data.studentId, fromClassId: this.data.fromClassId, targetEliteClassId: target.id, reason: this.data.reason, keepSource: this.data.keepSource, confirmCapacity } : { studentId: this.data.studentId, fromClassId: this.data.fromClassId, targetEliteClassId: target.id, recommendationReason: this.data.reason };
      const result = await api.call(action, payload);
      if (result.requiresConfirmation) return wx.showModal({ title: "超出标准容量", content: result.message, confirmText: "确认晋升", success: (modal) => { if (modal.confirm) this.save(true); } });
      wx.showToast({ title: this.data.role === "admin" ? "晋升完成" : "推荐已提交" });
      setTimeout(() => wx.navigateBack(), 400);
    } catch (error) { wx.showToast({ title: error.message || "提交失败", icon: "none" }); }
    finally { this.setData({ saving: false }); }
  }
});
