const api = require("../../utils/api");
function weekRange() { const date = new Date(), day = date.getDay() || 7, monday = new Date(date); monday.setDate(date.getDate() - day + 1); const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); const text = (value) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`; return { weekStart: text(monday), weekEnd: text(sunday) }; }
Page({
  data: { id: "", classes: [], curriculums: [], topics: [], classIndex: 0, curriculumIndex: 0, topicIndex: 0, form: { ...weekRange(), mainTheme: "", trainingFocusText: "", meetingNote: "", status: "DRAFT" }, saving: false },
  async onLoad(options) {
    this.setData({ id: options.id || "" });
    try {
      const [classes, curriculums, meta] = await Promise.all([api.call("listClasses"), api.call("listCurriculums"), api.call("getTrainingMeta")]);
      const topics = Object.keys(meta.trainingTopics).map((key) => ({ key, name: meta.trainingTopics[key] })); let form = this.data.form, classIndex = 0, curriculumIndex = 0, topicIndex = 0;
      if (options.id) { const row = await api.call("getWeeklyTrainingPlan", { id: options.id }); form = { ...row, trainingFocusText: (row.trainingFocus || []).join("、") }; classIndex = Math.max(0, classes.findIndex((item) => item.id === row.classId)); curriculumIndex = Math.max(0, curriculums.findIndex((item) => item.id === row.curriculumId)); topicIndex = Math.max(0, topics.findIndex((item) => item.key === row.themeKey)); }
      this.setData({ classes, curriculums, topics, form, classIndex, curriculumIndex, topicIndex });
    } catch (error) { wx.showModal({ title: "加载失败", content: error.message || "请稍后重试", showCancel: false }); }
  },
  field(event) { this.setData({ [`form.${event.currentTarget.dataset.key}`]: event.detail.value }); }, date(event) { this.setData({ [`form.${event.currentTarget.dataset.key}`]: event.detail.value }); }, pickClass(event) { this.setData({ classIndex: Number(event.detail.value) }); }, pickCurriculum(event) { this.setData({ curriculumIndex: Number(event.detail.value) }); },
  pickTopic(event) { const topicIndex = Number(event.detail.value), topic = this.data.topics[topicIndex]; this.setData({ topicIndex, "form.mainTheme": topic.name }); },
  async save() { const clubClass = this.data.classes[this.data.classIndex], curriculum = this.data.curriculums[this.data.curriculumIndex], topic = this.data.topics[this.data.topicIndex]; if (!clubClass || !curriculum || !topic) return wx.showToast({ title: "请完整选择班级、大纲和主题", icon: "none" }); this.setData({ saving: true }); try { const result = await api.call("saveWeeklyTrainingPlan", { plan: { ...this.data.form, id: this.data.id || undefined, classId: clubClass.id, curriculumId: curriculum.id, themeKey: topic.key, trainingFocus: String(this.data.form.trainingFocusText).split(/[、，,\n]+/).filter(Boolean) } }); this.setData({ id: result.id }); wx.showToast({ title: "周计划已保存" }); } finally { this.setData({ saving: false }); } },
  async confirm() { if (!this.data.id) return wx.showToast({ title: "请先保存草稿", icon: "none" }); await api.call("confirmWeeklyTrainingPlan", { id: this.data.id, meetingNote: this.data.form.meetingNote }); wx.showToast({ title: "周计划已确认" }); setTimeout(() => wx.navigateBack(), 400); }
});
