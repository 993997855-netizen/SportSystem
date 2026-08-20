const api = require("../../utils/api");

Page({
  data: { classId: "", query: "", students: [], loading: true, addingId: "" },
  onLoad(options) { this.setData({ classId: options.classId || "" }); this.search(); },
  field(event) { this.setData({ query: event.detail.value }); },
  async search() { this.setData({ loading: true }); try { this.setData({ students: await api.call("searchStudentsForClass", { classId: this.data.classId, query: this.data.query }), loading: false }); } catch (error) { this.setData({ loading: false }); } },
  add(event) { this.submit(event.currentTarget.dataset.id, false); },
  async submit(studentId, confirmCapacity) {
    if (this.data.addingId) return; this.setData({ addingId: studentId });
    try { const result = await api.call("addClassMember", { classId: this.data.classId, studentId, confirmCapacity }); if (result.requiresConfirmation) return wx.showModal({ title: "超出标准容量", content: result.message, confirmText: "确认添加", success: (modal) => { if (modal.confirm) this.submit(studentId, true); } }); wx.showToast({ title: result.duplicate ? "学员已在本班" : "添加成功" }); setTimeout(() => wx.navigateBack(), 350); }
    finally { this.setData({ addingId: "" }); }
  }
});
