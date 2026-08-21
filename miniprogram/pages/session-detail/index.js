const api = require("../../utils/api");

Page({
  data: { id: "", studentId: "", role: "parent", session: null, training: null, loading: true, error: "", acting: false, progress: 0 },
  onLoad(options) { this.setData({ id: options.id || "", studentId: options.studentId || getApp().globalData.activeStudentId || wx.getStorageSync("activeStudentId") || "" }); },
  onShow() { if (this.data.id) this.load(); },
  async load() {
    this.setData({ loading: true, error: "" });
    try { const [context, raw] = await Promise.all([api.call("getContext"), api.call("getSession", { id: this.data.id, studentId: this.data.studentId })]); const training = await api.call("getSessionTrainingPlan", { sessionId: this.data.id, studentId: this.data.studentId }); const session = { ...raw, enrollments: (raw.enrollments || []).map((item) => ({ ...item, student: { ...item.student, initial: item.student && item.student.name ? item.student.name[0] : "学" } })) }; this.setData({ role: context.user.role, session, training, progress: session.standardCapacity ? Math.min(100, Math.round(session.memberCount / session.standardCapacity * 100)) : 0, loading: false }); }
    catch (error) { this.setData({ loading: false, error: "课程信息加载失败" }); }
  },
  async primary() {
    const session = this.data.session; if (this.data.acting) return;
    if (session.myStatus === "leave_pending") return this.cancelLeave();
    if (session.myStatus === "leave_approved") return wx.showToast({ title: "已请假，本次不扣课时", icon: "none" });
    if (session.myStatus === "leave_rejected") return this.leave();
    if (session.myStatus === "booked") return this.leave();
    this.setData({ acting: true }); try { const result = await api.call("enrollSession", { sessionId: session.id, studentId: this.data.studentId }); wx.showModal({ title: result.status === "full" ? "本班已满" : "报名成功", content: result.message, showCancel: false, success: () => this.load() }); } finally { this.setData({ acting: false }); }
  },
  leave() {
    wx.showModal({ title: "申请请假", editable: true, placeholderText: "请输入请假原因", content: "", success: async (result) => { if (!result.confirm) return; this.setData({ acting: true }); try { await api.call("requestLeave", { sessionId: this.data.id, studentId: this.data.studentId, reason: result.content || "家长请假" }); wx.showModal({ title: "请假申请已提交", content: "等待管理员审批。批准后本节课记为请假且不扣课时。", showCancel: false, success: () => this.load() }); } finally { this.setData({ acting: false }); } } });
  },
  cancelLeave() { wx.showModal({ title: "撤销请假申请", content: "当前申请仍在待审批状态。撤销不会改变课程名单、考勤或课时。", success: async (result) => { if (!result.confirm) return; await api.call("cancelLeave", { id: this.data.session.leaveRequestId }); wx.showToast({ title: "请假已撤销" }); this.load(); } }); },
  attendance() { wx.navigateTo({ url: `/pages/attendance/index?sessionId=${this.data.id}` }); },
  feedback(event) { wx.navigateTo({ url: `/pages/feedback-form/index?sessionId=${this.data.id}&studentId=${event.currentTarget.dataset.student || ""}` }); },
  evaluation() { wx.navigateTo({ url: `/pages/training-evaluation/index?sessionId=${this.data.id}` }); },
  trainingExecution() { wx.navigateTo({ url: `/pages/training-execution/index?sessionId=${this.data.id}` }); },
  leaves() { wx.navigateTo({ url: "/pages/leave-requests/index" }); },
  edit() { wx.navigateTo({ url: `/pages/session-form/index?id=${this.data.id}` }); }
});
