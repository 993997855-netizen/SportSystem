const api = require("../../utils/api");
Page({
  data: { matchId: "", teamId: "", loading: true, team: {}, members: [], saving: false },
  onLoad(options) { this.setData({ matchId: options.matchId || "", teamId: options.teamId || "" }); this.load(); },
  async load() { this.setData({ loading: true }); try { const data = await api.call("getLeagueTeamRoster", { matchId: this.data.matchId, teamId: this.data.teamId }); this.setData({ ...data, loading: false }); } catch (error) { this.setData({ loading: false }); } },
  toggle(event) { const index = Number(event.currentTarget.dataset.index); this.setData({ [`members[${index}].selected`]: !this.data.members[index].selected }); },
  async save() { const members = this.data.members.filter((item) => item.selected).map((item) => ({ memberType: item.memberType, studentId: item.memberType === "INTERNAL_STUDENT" ? item.memberId : "", externalPlayerId: item.memberType === "EXTERNAL_PLAYER" ? item.memberId : "", jerseyNumber: item.jerseyNumber || "", starter: true })); this.setData({ saving: true }); try { await api.call("saveMatchSquad", { matchId: this.data.matchId, teamId: this.data.teamId, members }); wx.showToast({ title: "比赛名单已保存" }); setTimeout(() => wx.navigateBack(), 400); } finally { this.setData({ saving: false }); } }
});
