const api = require("../../utils/api");

Page({
  data: { loading: true, error: "", role: "parent", activeStudentId: "", data: { rounds: [], teams: [], matches: [], standings: [] } },
  onShow() { this.load(); },
  onPullDownRefresh() { this.load(); },
  async load() {
    this.setData({ loading: true, error: "" });
    try {
      const context = await api.call("getContext");
      const activeStudentId = context.user.role === "parent" ? (getApp().globalData.activeStudentId || wx.getStorageSync("activeStudentId") || "") : "";
      const data = await api.call("getLeagueDashboard", { studentId: activeStudentId || undefined });
      const rounds = (data.rounds || []).map((item) => ({ ...item, displayDate: String(item.date || "").slice(5), birthYearsText: (item.birthYears || []).join("-") }));
      this.setData({ role: context.user.role, activeStudentId, data: { ...data, rounds, nextRound: data.nextRound ? { ...data.nextRound, birthYearsText: (data.nextRound.birthYears || []).join("-") } : null }, loading: false });
    } catch (error) {
      this.setData({ loading: false, error: error.message || "成长联赛加载失败" });
    } finally { wx.stopPullDownRefresh(); }
  },
  retry() { this.load(); },
  round(event) { wx.navigateTo({ url: `/pages/league-round-detail/index?id=${event.currentTarget.dataset.id}&studentId=${this.data.activeStudentId}` }); },
  season() { wx.navigateTo({ url: `/pages/league-season-form/index?leagueId=${this.data.data.league.id}` }); },
  team() { wx.navigateTo({ url: `/pages/league-team-form/index?seasonId=${this.data.data.season.id}` }); },
  match(event) { wx.navigateTo({ url: `/pages/league-match-form/index?roundId=${this.data.data.nextRound.id}&matchId=${event.currentTarget.dataset.id}` }); }
});
