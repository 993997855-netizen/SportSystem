const api = require("../../utils/api");
Page({
  data: { view: "all", query: "", status: "", intentionLevel: "", source: "", ownerCoachId: "", interestedProgram: "", createdStart: "", createdEnd: "", sort: "created", sortOptions: ["最新创建", "最近跟进", "最久未跟进", "下次跟进"], rows: [], meta: { statuses: {} }, loading: true, role: "" },
  onLoad(options) { this.setData({ view: options.view || "all" }); }, onShow() { this.load(); }, onPullDownRefresh() { this.load(); },
  async load() { this.setData({ loading: true }); try { const filters = { view: this.data.view, query: this.data.query, status: this.data.status, intentionLevel: this.data.intentionLevel, source: this.data.source, ownerCoachId: this.data.ownerCoachId, interestedProgram: this.data.interestedProgram, createdStart: this.data.createdStart, createdEnd: this.data.createdEnd, sort: this.data.view === "due" ? "next" : this.data.sort }; const [context, meta, rawRows] = await Promise.all([api.call("getContext"), api.call("getCrmMeta"), api.call("listLeads", filters)]); const statuses = Object.keys(meta.statuses).map((value) => ({ value, label: meta.statuses[value] })); const dueLabels = { overdue: "已逾期", today: "今天需要跟进", threeDays: "未来三天", sevenDays: "未来七天", later: "以后", none: "未安排" }; let previous = ""; const rows = rawRows.map((item) => { const showDueTitle = this.data.view === "due" && item.dueBucket !== previous; previous = item.dueBucket; return { ...item, showDueTitle, dueTitle: dueLabels[item.dueBucket] || "待跟进" }; }); this.setData({ role: context.user.role, meta: { ...meta, statusOptions: [{ value: "", label: "全部状态" }, ...statuses], intentionOptions: ["全部意向", ...meta.intentions], sourceOptions: ["全部来源", ...meta.sources], coachOptions: [{ id: "", name: "全部负责人" }, ...meta.coaches] }, rows, loading: false }); } finally { wx.stopPullDownRefresh(); } },
  query(event) { this.setData({ query: event.detail.value }); }, search() { this.load(); },
  status(event) { const option = this.data.meta.statusOptions[Number(event.detail.value)]; this.setData({ status: option.value, statusLabel: option.label }, () => this.load()); },
  intention(event) { const index = Number(event.detail.value); this.setData({ intentionLevel: index ? this.data.meta.intentions[index - 1] : "", intentionLabel: this.data.meta.intentionOptions[index] }, () => this.load()); },
  source(event) { const index = Number(event.detail.value); this.setData({ source: index ? this.data.meta.sources[index - 1] : "", sourceLabel: this.data.meta.sourceOptions[index] }, () => this.load()); },
  coach(event) { const option = this.data.meta.coachOptions[Number(event.detail.value)]; this.setData({ ownerCoachId: option.id, coachLabel: option.name }, () => this.load()); },
  program(event) { this.setData({ interestedProgram: event.detail.value }); },
  createdStart(event) { this.setData({ createdStart: event.detail.value }, () => this.load()); }, createdEnd(event) { this.setData({ createdEnd: event.detail.value }, () => this.load()); },
  sort(event) { const values = ["created", "followed", "oldest", "next"]; this.setData({ sort: values[Number(event.detail.value)] }, () => this.load()); },
  detail(event) { wx.navigateTo({ url: `/pages/lead-detail/index?id=${event.currentTarget.dataset.id}` }); }, add() { wx.navigateTo({ url: "/pages/lead-form/index" }); },
  async claim(event) { await api.call("claimPublicLead", { id: event.currentTarget.dataset.id }); wx.showToast({ title: "领取成功" }); this.load(); }
});


