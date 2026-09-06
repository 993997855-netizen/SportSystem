const api = require("../../utils/api");

Page({
  data: { requests: [], loading: true, error: "", actingId: "" },
  onShow() { this.load(); },
  onPullDownRefresh() { this.load(); },
  async load() {
    this.setData({ loading: true, error: "" });
    try {
      const requests = await api.call("listChildProfileRequests", { status: "PENDING_REVIEW" });
      this.setData({ requests: (requests || []).map((item) => ({ ...item, idCardDisplay: item.idCardMasked || item.idCardNumber || "未填写" })), loading: false });
    } catch (error) {
      this.setData({ loading: false, error: error.message || "孩子资料审核加载失败" });
    } finally { wx.stopPullDownRefresh(); }
  },
  review(event) {
    const id = event.currentTarget.dataset.id;
    const decision = event.currentTarget.dataset.decision;
    const request = this.data.requests.find((item) => item.id === id);
    if (!request || this.data.actingId) return;
    wx.showModal({
      title: decision === "APPROVE" ? "通过孩子资料" : "驳回孩子资料",
      editable: true,
      placeholderText: decision === "APPROVE" ? "审核备注（可选）" : "请输入驳回原因",
      content: decision === "APPROVE" ? "通过后将创建学员档案并绑定该家长。" : "",
      success: async (result) => {
        if (!result.confirm || (decision === "REJECT" && !String(result.content || "").trim())) return;
        this.setData({ actingId: id });
        try {
          await api.call("reviewChildProfileRequest", { id, decision, reviewRemark: String(result.content || "").trim() });
          wx.showToast({ title: decision === "APPROVE" ? "已通过" : "已驳回", icon: "none" });
          this.load();
        } catch (error) { wx.showToast({ title: error.message || "审核失败", icon: "none" }); }
        finally { this.setData({ actingId: "" }); }
      }
    });
  }
});
