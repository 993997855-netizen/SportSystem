const api = require("../../utils/api");
const { roleLabels, today } = require("../../utils/format");

Page({
  data: { loading: true, error: "", dashboard: {}, user: {}, roleLabel: "", today: today(), stat4Label: "待确认续费", stat4Value: 0, attentionTitle: "重点关注" },
  onShow() { this.load(); },
  onPullDownRefresh() { this.load(true); },
  async load(fromRefresh = false) {
    if (!fromRefresh) this.setData({ loading: true, error: "" });
    try {
      const [context, dashboard] = await Promise.all([api.call("getContext"), api.call("getDashboard")]);
      const isCoach = context.user.role === "coach";
      this.setData({
        user: context.user,
        dashboard,
        roleLabel: roleLabels[context.user.role],
        stat4Label: isCoach ? "今日已点名" : "待确认续费",
        stat4Value: isCoach ? dashboard.todayAttendance : dashboard.pendingRenewals,
        attentionTitle: dashboard.lowBalance ? "低课时提醒" : "学员概览",
        loading: false,
        error: ""
      });
    } catch (error) {
      this.setData({ loading: false, error: "数据加载失败，请检查网络后重试" });
    } finally {
      wx.stopPullDownRefresh();
    }
  },
  goStudents() { wx.switchTab({ url: "/pages/students/index" }); },
  goClasses() { wx.switchTab({ url: "/pages/classes/index" }); },
  goRenewals() { wx.navigateTo({ url: "/pages/renewals/index" }); },
  goStat4() { if (this.data.dashboard.role === "coach") this.goClasses(); else this.goRenewals(); },
  goStudent(event) { wx.navigateTo({ url: `/pages/student-detail/index?id=${event.currentTarget.dataset.id}` }); },
  takeAttendance(event) { wx.navigateTo({ url: `/pages/attendance/index?classId=${event.currentTarget.dataset.id}` }); }
});
