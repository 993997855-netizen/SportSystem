const api = require("../../utils/api");

Page({
  data: { loading: true, error: "", coach: null, role: "parent", workSummary: null, expandedCertificates: false, visibleCertificates: [], moreCertificateCount: 0, classPreview: [], moreClassCount: 0 },
  onLoad(options) { this.coachId = options.id; this.load(); },
  async load() {
    this.setData({ loading: true, error: "" });
    try {
      const [raw, context] = await Promise.all([api.call("getPublicCoach", { id: this.coachId }), api.call("getContext")]);
      const coach = { ...raw, initial: (raw.name || "教")[0] };
      let workSummary = null; if (context.user.role === "admin") { const profile = await api.call("getCoachProfile", { id: this.coachId }); if (profile.coachUserId) workSummary = await api.call("getCoachWorkSummary", { coachId: profile.coachUserId }); }
      this.setData({ coach, role: context.user.role, workSummary, loading: false }, () => this.decorate());
    } catch (error) { this.setData({ loading: false, error: "教练介绍加载失败，请稍后重试" }); }
  },
  decorate() {
    const coach = this.data.coach || {};
    const additional = (coach.mainCertificates || []).filter((item) => item !== coach.highestCertificate);
    this.setData({
      visibleCertificates: this.data.expandedCertificates ? additional : additional.slice(0, 2),
      moreCertificateCount: Math.max(0, additional.length - 2),
      classPreview: (coach.currentClasses || []).slice(0, 3),
      moreClassCount: Math.max(0, (coach.currentClasses || []).length - 3)
    });
  },
  toggleCertificates() { this.setData({ expandedCertificates: !this.data.expandedCertificates }, () => this.decorate()); }
});
