const api = require("../../utils/api");
Page({
  data: { seasonId: "", name: "", organizationType: "EXTERNAL", organizationName: "", birthYears: "2017,2018", contactName: "", contactMobile: "", coachName: "", classes: [], classIndex: 0, coaches: [], coachIndex: 0, students: [], studentIndex: 0, jerseyNumber: "", saving: false },
  onLoad(options) { this.setData({ seasonId: options.seasonId || "" }); this.load(); },
  async load() {
    const [students, classes, coaches] = await Promise.all([api.call("listStudents"), api.call("listClasses"), api.call("listClassCoaches")]);
    this.setData({ students, classes, coaches });
  },
  field(event) { this.setData({ [event.currentTarget.dataset.key]: event.detail.value }); },
  type(event) { this.setData({ organizationType: event.detail.value ? "EXTERNAL" : "INTERNAL" }); },
  student(event) { this.setData({ studentIndex: Number(event.detail.value) }); },
  clubClass(event) { this.setData({ classIndex: Number(event.detail.value) }); },
  coach(event) { this.setData({ coachIndex: Number(event.detail.value) }); },
  async save() {
    if (!this.data.name.trim()) return wx.showToast({ title: "请填写球队名称", icon: "none" });
    this.setData({ saving: true });
    try {
      const years = this.data.birthYears.split(",").map(Number).filter(Boolean);
      const coach = this.data.coaches[this.data.coachIndex] || {};
      const clubClass = this.data.classes[this.data.classIndex] || {};
      const result = await api.call("saveLeagueTeam", { name: this.data.name.trim(), organizationType: this.data.organizationType, organizationName: this.data.organizationName, birthYearGroup: years, contactName: this.data.contactName, contactMobile: this.data.contactMobile, coachName: this.data.organizationType === "INTERNAL" ? coach.name || "" : this.data.coachName, classId: this.data.organizationType === "INTERNAL" ? clubClass.id || "" : "", coachUserId: this.data.organizationType === "INTERNAL" ? coach.id || "" : "" });
      const registration = await api.call("registerSeasonTeam", { seasonId: this.data.seasonId, teamId: result.id, birthYearGroup: years });
      if (registration.confirmationRequired) throw new Error(registration.message);
      if (this.data.organizationType === "EXTERNAL") wx.redirectTo({ url: `/pages/league-external-player-form/index?teamId=${result.id}` });
      else { const student = this.data.students[this.data.studentIndex]; if (student) await api.call("saveLeagueTeamMember", { teamId: result.id, studentId: student.id, jerseyNumber: this.data.jerseyNumber }); wx.navigateBack(); }
    } finally { this.setData({ saving: false }); }
  }
});
