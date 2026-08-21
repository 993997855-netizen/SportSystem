const api = require("../../utils/api");
const { today } = require("../../utils/format");

Page({
  data: { studentId: "", student: null, loading: true, matchDate: today(), opponent: "", teamName: "南联", position: "", minutesPlayed: "", goals: "0", assists: "0", coachRating: 4, coachComment: "", visibility: "STAFF_ONLY", saving: false },
  async onLoad(options) {
    const studentId = options.studentId || "";
    this.setData({ studentId });
    try {
      const profile = await api.call("getGrowthProfile", { studentId });
      const student = { ...profile.student, initial: profile.student.name ? profile.student.name[0] : "学" };
      this.setData({ student, loading: false });
    } catch (error) { this.setData({ loading: false }); }
  },
  field(event) { this.setData({ [event.currentTarget.dataset.key]: event.detail.value }); },
  date(event) { this.setData({ matchDate: event.detail.value }); },
  visible(event) { this.setData({ visibility: event.detail.value ? "PARENT_VISIBLE" : "STAFF_ONLY" }); },
  async save() {
    if (!this.data.opponent.trim() || !this.data.teamName.trim()) return wx.showToast({ title: "请填写比赛信息", icon: "none" });
    this.setData({ saving: true });
    try {
      const { studentId, matchDate, opponent, teamName, position, minutesPlayed, goals, assists, coachRating, coachComment, visibility } = this.data;
      await api.call("saveMatchRecord", { studentId, matchDate, opponent, teamName, position, minutesPlayed, goals, assists, coachRating, coachComment, visibility });
      wx.showToast({ title: "比赛记录已保存" }); setTimeout(() => wx.navigateBack(), 400);
    }
    finally { this.setData({ saving: false }); }
  }
});
