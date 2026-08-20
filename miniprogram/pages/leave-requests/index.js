const api = require("../../utils/api");

Page({
  data: { role: "parent", requests: [], loading: true, error: "", reviewing: "" },
  onShow() { this.load(); }, onPullDownRefresh() { this.load(); },
  async load() { this.setData({ loading: true, error: "" }); try { const [context, requests] = await Promise.all([api.call("getContext"), api.call("listLeaveRequests")]); const labels = { pending: "待审批", approved: "已请假", rejected: "请假被拒绝", cancelled: "已撤销" }; this.setData({ role: context.user.role, requests: requests.map((item) => ({ ...item, statusLabel: labels[item.status] || item.status })), loading: false }); } catch (error) { this.setData({ loading: false, error: "请假记录加载失败" }); } finally { wx.stopPullDownRefresh(); } },
  review(event) { const id = event.currentTarget.dataset.id; const approved = event.currentTarget.dataset.approved === "true"; wx.showModal({ title: approved ? "批准请假" : "拒绝请假", content: approved ? "批准后，本节课记为已请假并扣课0节；应到名单和课程名额保持不变。" : "拒绝后仍由教练正常点名，不会自动记为缺勤。", success: async (result) => { if (!result.confirm) return; this.setData({ reviewing: id }); try { await api.call("reviewLeave", { id, approved }); wx.showToast({ title: approved ? "已批准请假" : "已拒绝", icon: "none" }); this.load(); } finally { this.setData({ reviewing: "" }); } } }); },
  cancel(event) { const id = event.currentTarget.dataset.id; wx.showModal({ title: "撤销请假申请", content: "仅撤销待审批申请，不会改变课程名单、考勤或课时。", success: async (result) => { if (!result.confirm) return; await api.call("cancelLeave", { id }); wx.showToast({ title: "请假已撤销" }); this.load(); } }); }
});
