const api = require("../../utils/api");

Page({
  data: { loading: true, saving: false, session: null, coaches: [], selected: [], reason: "" },
  onLoad(options) { this.id = options.id; this.load(); },
  async load() {
    const [session, rows] = await Promise.all([api.call("getSession", { id: this.id }), api.call("listActiveCoaches")]);
    const selected = (session.actualCoaches.length ? session.actualCoaches : session.plannedCoaches).map((row) => row.coachId);
    const coaches = rows.map((item) => ({ ...item, initial: (item.name || "教")[0], classNameText: (item.classNames || []).join("、"), checked: selected.includes(item.id) }));
    this.setData({ session, coaches, selected, loading: false });
  },
  select(event) { const selected = event.detail.value; this.setData({ selected, coaches: this.data.coaches.map((item) => ({ ...item, checked: selected.includes(item.id) })) }); },
  reason(event) { this.setData({ reason: event.detail.value }); },
  async submit(forceConflict = false, conflictReason = "") {
    if (!this.data.selected.length) return wx.showToast({ title: "至少选择一名教练", icon: "none" });
    this.setData({ saving: true });
    try {
      const planned = new Set((this.data.session.plannedCoaches || []).map((row) => row.coachId));
      const actualCoachAssignments = this.data.selected.map((coachId) => ({ coachId, role: planned.has(coachId) ? ((this.data.session.plannedCoaches.find((row) => row.coachId === coachId) || {}).role || "ASSISTANT") : "SUBSTITUTE" }));
      const result = await api.call("assignSessionCoaches", { sessionId: this.id, actualCoachAssignments, reason: this.data.reason, forceConflict, conflictReason });
      if (result.confirmationRequired) return wx.showModal({ title: "发现排班冲突", editable: true, placeholderText: "填写强制安排原因", content: (result.conflicts || []).map((row) => row.message).join("\n"), success: (modal) => { if (modal.confirm) this.submit(true, modal.content); } });
      wx.showToast({ title: "本节教练已更新" }); setTimeout(() => wx.navigateBack(), 400);
    } finally { this.setData({ saving: false }); }
  }
});
