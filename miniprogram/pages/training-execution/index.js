const api = require("../../utils/api");
Page({
  data: { sessionId: "", detail: null, topics: [], topicIndex: 0, weeklyPlans: [], weeklyIndex: 0, form: { trainingTheme: "", trainingFocusText: "", trainingNote: "" }, saving: false },
  async onLoad(options) {
    this.setData({ sessionId: options.sessionId || "" });
    try {
      const [meta, detail] = await Promise.all([api.call("getTrainingMeta"), api.call("getSessionTrainingInfo", { sessionId: options.sessionId })]);
      const weeklyPlans = await api.call("listWeeklyTrainingPlans", { classId: detail.session.classId });
      const topics = Object.keys(meta.trainingTopics).map((key) => ({ key, name: meta.trainingTopics[key] }));
      this.setData({ detail, topics, weeklyPlans, topicIndex: Math.max(0, topics.findIndex((item) => item.key === detail.trainingThemeKey)), weeklyIndex: Math.max(0, weeklyPlans.findIndex((item) => item.id === detail.weeklyTrainingPlanId)), form: { trainingTheme: detail.trainingTheme || "", trainingFocusText: detail.trainingFocus || "", trainingNote: detail.trainingNote || "" } });
    } catch (error) { wx.showModal({ title: "加载失败", content: error.message || "请稍后重试", showCancel: false }); }
  },
  field(event) { this.setData({ [`form.${event.currentTarget.dataset.key}`]: event.detail.value }); },
  topic(event) { const topicIndex = Number(event.detail.value); this.setData({ topicIndex, "form.trainingTheme": this.data.topics[topicIndex].name }); }, weekly(event) { this.setData({ weeklyIndex: Number(event.detail.value) }); },
  async save() { const topic = this.data.topics[this.data.topicIndex], weekly = this.data.weeklyPlans[this.data.weeklyIndex]; this.setData({ saving: true }); try { await api.call("saveSessionTrainingInfo", { sessionId: this.data.sessionId, trainingTheme: this.data.form.trainingTheme, trainingThemeKey: topic ? topic.key : "", trainingFocus: this.data.form.trainingFocusText, trainingNote: this.data.form.trainingNote, weeklyTrainingPlanId: weekly ? weekly.id : "" }); wx.showToast({ title: "训练重点已保存" }); setTimeout(() => wx.navigateBack(), 400); } finally { this.setData({ saving: false }); } }
});
