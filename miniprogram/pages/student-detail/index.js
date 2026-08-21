const api = require("../../utils/api");
const { attendanceLabels } = require("../../utils/format");

Page({
  data: { id: "", student: null, role: "admin", mode: "local", loading: true, error: "", inviting: false, attendanceLabels },
  onLoad(options) { this.setData({ id: options.id }); },
  onShow() { if (this.data.id) this.load(); },
  async load() {
    this.setData({ loading: true, error: "" });
    try {
      const [context, student] = await Promise.all([api.call("getContext"), api.call("getStudent", { id: this.data.id })]);
      student.initial = student.name ? student.name[0] : "学";
      student.attendance = student.attendance.map((item) => ({ ...item, statusLabel: attendanceLabels[item.status] }));
      const labels = { PENDING: "待审核", APPROVED: "已通过", REJECTED: "暂不入选", WITHDRAWN: "已撤销" };
      student.eliteSelections = (student.eliteSelections || []).map((item) => ({ ...item, statusLabel: labels[item.status] || item.status }));
      this.setData({ student: { ...student, lowBalance: Number(student.remainingLessons) <= 5 }, role: context.user.role, mode: context.mode, loading: false });
    } catch (error) { this.setData({ loading: false, error: "学员详情加载失败" }); }
  },
  edit() { wx.navigateTo({ url: `/pages/student-form/index?id=${this.data.id}` }); },
  renew() { wx.navigateTo({ url: `/pages/renewals/index?studentId=${this.data.id}` }); },
  growth() { wx.navigateTo({ url: `/pages/growth-profile/index?studentId=${this.data.id}` }); },
  elite() { const source = (this.data.student.classes || []).find((item) => item.classType === "REGULAR") || {}; wx.navigateTo({ url: `/pages/elite-action/index?studentId=${this.data.id}&fromClassId=${source.id || ""}` }); },
  async parentInvite() {
    if (this.data.inviting) return;
    this.setData({ inviting: true });
    try {
      const result = await api.call("createInvite", { role: "parent", studentId: this.data.id, displayName: this.data.student.guardianName });
      wx.showModal({ title: "家长绑定邀请码", content: `${result.code}\n\n请家长在“我的”页面输入。邀请码使用一次后失效。`, showCancel: false, confirmText: "知道了" });
    } finally { this.setData({ inviting: false }); }
  }
});
