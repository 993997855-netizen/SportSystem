const api = require("../../utils/api");
const { today } = require("../../utils/format");
const navigation = require("../../utils/navigation-config");

Page({
  data: { classes: [], role: "admin", mode: "local", keyword: "", today: today(), loading: true, hasLoaded: false, error: "", invitingId: "" },
  onShow() { this.load(); },
  onPullDownRefresh() { api.clearCache(); this.load(true); },
  async load(fromRefresh = false) {
    const loadId = (this._loadId || 0) + 1;
    this._loadId = loadId;
    if (!fromRefresh && !this.data.hasLoaded) this.setData({ loading: true, error: "" });
    try {
      const [context, classes] = await Promise.all([api.call("getContext"), api.call("listClasses", { keyword: this.data.keyword })]);
      wx.setNavigationBarTitle({ title: context.user.role === "admin" ? "班级管理" : context.user.role === "coach" ? "我的班级" : "班级报名" });
      if (loadId !== this._loadId) return;
      this.setData({ classes, role: context.user.role, mode: context.mode, loading: false, hasLoaded: true, error: "" });
    } catch (error) { if (loadId === this._loadId) this.setData({ loading: false, error: "班级数据加载失败" }); }
    finally { wx.stopPullDownRefresh(); }
  },
  attendance() { navigation.openFeature(this.data.role === "admin" ? "adminCourses" : "coachAttendance", this.data.role); },
  keyword(event) { this.setData({ keyword: event.detail.value }); },
  search() { this.load(); },
  open(event) { wx.navigateTo({ url: `/pages/class-detail/index?id=${event.currentTarget.dataset.id}` }); },
  add() { wx.navigateTo({ url: "/pages/class-form/index" }); },
  edit(event) { wx.navigateTo({ url: `/pages/class-form/index?id=${event.currentTarget.dataset.id}` }); },
  coachInvite() { wx.navigateTo({ url: "/pages/coach-team/index" }); }
});
