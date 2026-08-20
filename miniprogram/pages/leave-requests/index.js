const api = require("../../utils/api");

Page({
  data: { role: "parent", requests: [], loading: true, error: "", reviewing: "" },
  onShow() { this.load(); }, onPullDownRefresh() { this.load(); },
  async load() { this.setData({ loading: true, error: "" }); try { const [context, requests] = await Promise.all([api.call("getContext"), api.call("listLeaveRequests")]); this.setData({ role: context.user.role, requests: requests.map((item) => ({ ...item, statusLabel: item.status === "pending" ? "待审核" : item.status === "approved" ? "已同意" : "已拒绝" })), loading: false }); } catch (error) { this.setData({ loading: false, error: "请假记录加载失败" }); } finally { wx.stopPullDownRefresh(); } },
  review(event) { const id = event.currentTarget.dataset.id; const approved = event.currentTarget.dataset.approved === "true"; wx.showModal({ title: approved ? "同意请假" : "拒绝请假", content: approved ? "同意后释放本节课程名额；新流程不会自动递补历史候补。" : "确认拒绝本次请假申请？", success: async (result) => { if (!result.confirm) return; this.setData({ reviewing: id }); try { await api.call("reviewLeave", { id, approved }); wx.showToast({ title: approved ? "已同意" : "已拒绝", icon: "none" }); this.load(); } finally { this.setData({ reviewing: "" }); } } }); }
});
