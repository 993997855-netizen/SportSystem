const api = require("../../utils/api");

Page({
  data: {
    id: "",
    role: "parent",
    detail: { round: {}, matches: [] },
    date: "",
    birthYears: "",
    venue: "",
    saving: false,
  },

  onLoad(options) {
    this.setData({ id: options.id });
  },

  onShow() {
    this.load();
  },

  async load() {
    const activeStudentId = wx.getStorageSync("activeStudentId") || "";
    const [context, detail] = await Promise.all([
      api.call("getContext"),
      api.call("getLeagueRound", { id: this.data.id, studentId: activeStudentId }),
    ]);
    this.setData({
      role: context.user.role,
      detail,
      date: detail.round.date,
      birthYears: (detail.round.birthYears || []).join(","),
      venue: detail.round.venueId,
    });
  },

  field(event) {
    this.setData({ [event.currentTarget.dataset.key]: event.detail.value });
  },

  date(event) {
    this.setData({ date: event.detail.value });
  },

  async update(event) {
    const status = event.currentTarget.dataset.status || this.data.detail.round.status;
    await api.call("updateLeagueRound", {
      id: this.data.id,
      date: this.data.date,
      birthYears: this.data.birthYears.split(",").map(Number),
      venueId: this.data.venue,
      status,
    });
    wx.showToast({ title: status === "POSTPONED" ? "已延期" : status === "CANCELLED" ? "已取消" : "已保存" });
    this.load();
  },

  async generate() {
    const result = await api.call("generateRoundRobin", { roundId: this.data.id });
    wx.showToast({ title: `生成${result.created}场` });
    this.load();
  },

  match(event) {
    wx.navigateTo({ url: `/pages/league-match-form/index?roundId=${this.data.id}&matchId=${event.currentTarget.dataset.id}` });
  },
});
