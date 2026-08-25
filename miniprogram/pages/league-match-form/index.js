const api = require("../../utils/api");
Page({
  data: { roundId: "", matchId: "", loading: true, role: "parent", match: { homeTeam: {}, awayTeam: {} }, homeScore: "0", awayScore: "0", startTime: "", venue: "", saving: false },
  onLoad(options) { this.setData({ roundId: options.roundId || "", matchId: options.matchId || "" }); },
  onShow() { this.load(); },
  async load() { this.setData({ loading: true }); const [context, detail] = await Promise.all([api.call("getContext"), api.call("getLeagueRound", { id: this.data.roundId })]); const match = detail.matches.find((item) => item.id === this.data.matchId); if (!match) return this.setData({ loading: false }); this.setData({ loading: false, role: context.user.role, match, homeScore: match.homeScore === null ? "0" : String(match.homeScore), awayScore: match.awayScore === null ? "0" : String(match.awayScore), startTime: match.startTime, venue: match.venueId }); },
  field(event) { this.setData({ [event.currentTarget.dataset.key]: event.detail.value }); },
  squad(event) { wx.navigateTo({ url: `/pages/league-squad/index?matchId=${this.data.matchId}&teamId=${event.currentTarget.dataset.team}` }); },
  async save() { this.setData({ saving: true }); try { await api.call("saveLeagueMatch", { id: this.data.matchId, homeScore: Number(this.data.homeScore), awayScore: Number(this.data.awayScore), startTime: this.data.startTime, venueId: this.data.venue, status: "FINISHED" }); wx.showToast({ title: "比分已保存" }); this.load(); } finally { this.setData({ saving: false }); } }
});
