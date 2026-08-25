const api = require("../../utils/api");
Page({
  data: { leagueId: "", name: "", startDate: "2026-09-01", endDate: "2026-12-31", modeIndex: 0, modes: [{ key: "CALENDAR_WEEK", name: "按自然周" }, { key: "SEASON_ROUND", name: "按赛季轮次" }], oddYears: "2017,2018", evenYears: "2015,2016", standingsEnabled: false, winPoints: "3", drawPoints: "1", lossPoints: "0", saving: false },
  onLoad(options) { this.setData({ leagueId: options.leagueId || "" }); },
  field(event) { this.setData({ [event.currentTarget.dataset.key]: event.detail.value }); },
  date(event) { this.setData({ [event.currentTarget.dataset.key]: event.detail.value }); },
  mode(event) { this.setData({ modeIndex: Number(event.detail.value) }); },
  standings(event) { this.setData({ standingsEnabled: event.detail.value }); },
  async save() {
    if (!this.data.name.trim()) return wx.showToast({ title: "请填写赛季名称", icon: "none" });
    this.setData({ saving: true });
    try {
      const result = await api.call("createLeagueSeason", { leagueId: this.data.leagueId, name: this.data.name.trim(), startDate: this.data.startDate, endDate: this.data.endDate, scheduleMode: this.data.modes[this.data.modeIndex].key, oddWeekBirthYears: this.data.oddYears.split(",").map(Number).filter(Boolean), evenWeekBirthYears: this.data.evenYears.split(",").map(Number).filter(Boolean), defaultVenueIds: ["三江南联球场"], standingsEnabled: this.data.standingsEnabled, pointsRule: { win: Number(this.data.winPoints), draw: Number(this.data.drawPoints), loss: Number(this.data.lossPoints) }, status: "ACTIVE" });
      await api.call("generateLeagueRounds", { seasonId: result.id });
      wx.showToast({ title: "赛季与轮次已创建" }); setTimeout(() => wx.navigateBack(), 500);
    } finally { this.setData({ saving: false }); }
  }
});
