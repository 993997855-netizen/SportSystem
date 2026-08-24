const assert = require("assert");
const fs = require("fs");
const path = require("path");

const storage = {};
global.wx = {
  getStorageSync(key) { return storage[key]; },
  setStorageSync(key, value) { storage[key] = value; }
};

const domain = require("../miniprogram/utils/local-domain");
const admin = (action, data = {}) => domain.call(action, { ...data, previewRole: "admin" });
const parent = (action, data = {}) => domain.call(action, { ...data, previewRole: "parent", previewUserId: "parent1" });

async function rejects(fn, pattern) {
  let error;
  try { await fn(); } catch (caught) { error = caught; }
  assert(error, "expected rejection");
  if (pattern) assert(pattern.test(error.message), error.message);
}

function source(relativePath) {
  return fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8");
}

async function run() {
  await admin("resetDemo");
  let checks = 0;
  const coachId = "coach-profile-you";
  const nextAvatarUrl = "cloud://nanlian-prod/coach-photos/internal/2026-08-22/coach1-new.jpg";

  const beforeProfile = await admin("getCoachProfile", { id: coachId });
  assert(beforeProfile.avatarUrl);
  checks += 1;

  const uploader = source("miniprogram/utils/coach-photo.js");
  assert(uploader.includes("wx.chooseMedia"));
  assert(uploader.includes('sourceType: ["album", "camera"]'));
  assert(uploader.includes("wx.cloud.uploadFile"));
  assert(!uploader.includes("base64"));
  checks += 1;

  const form = source("miniprogram/pages/coach-profile-form/index.js");
  assert(form.includes("previewAvatarUrl"));
  assert(form.includes("wx.previewImage"));
  assert(form.includes("photoDirty"));
  checks += 1;

  assert(form.includes("cancelAvatar()"));
  assert(form.includes("previewAvatarUrl: this.data.originalAvatarUrl"));
  checks += 1;

  await admin("listClasses");
  await admin("listSessions");
  await admin("getLeagueDashboard", { today: "2026-08-23" });
  const beforeBusiness = JSON.stringify({
    classes: storage.nanlianClubV2.classes,
    sessions: storage.nanlianClubV2.sessions,
    matches: storage.nanlianClubV2.matches
  });
  const updated = await admin("updateCoachAvatar", { coachId, avatarUrl: nextAvatarUrl });
  assert.strictEqual(updated.avatarUrl, nextAvatarUrl);
  assert.strictEqual(updated.unchanged, false);
  checks += 1;

  const refreshed = await admin("getCoachProfile", { id: coachId });
  assert.strictEqual(refreshed.avatarUrl, nextAvatarUrl);
  checks += 1;

  const publicList = await parent("listPublicCoaches");
  assert.strictEqual(publicList.find((item) => item.coachId === coachId).avatarUrl, nextAvatarUrl);
  checks += 1;

  const publicDetail = await parent("getPublicCoach", { id: coachId });
  assert.strictEqual(publicDetail.avatarUrl, nextAvatarUrl);
  checks += 1;

  const classes = await admin("listClasses");
  const sessions = await admin("listSessions");
  const league = await admin("getLeagueDashboard", { today: "2026-08-23" });
  assert(classes.some((item) => item.headCoach.coachId === coachId && item.headCoach.avatarUrl === nextAvatarUrl));
  assert(sessions.some((item) => item.coach.coachId === coachId && item.coach.avatarUrl === nextAvatarUrl));
  assert(league.teams.some((item) => item.organizationType === "INTERNAL" && item.coach.coachId === coachId && item.coach.avatarUrl === nextAvatarUrl));
  checks += 1;

  assert.strictEqual(refreshed.id, beforeProfile.id);
  assert.strictEqual(refreshed.coachUserId, beforeProfile.coachUserId);
  checks += 1;

  const afterBusiness = JSON.stringify({
    classes: storage.nanlianClubV2.classes,
    sessions: storage.nanlianClubV2.sessions,
    matches: storage.nanlianClubV2.matches
  });
  assert.strictEqual(afterBusiness, beforeBusiness);
  checks += 1;

  await rejects(() => parent("updateCoachAvatar", { coachId, avatarUrl: "cloud://invalid.jpg" }), /权限/);
  checks += 1;

  const audit = storage.nanlianClubV2.auditLogs.find((item) => item.action === "UPDATE_COACH_AVATAR" && item.coachId === coachId);
  assert(audit);
  assert.strictEqual(audit.operatorId, "admin");
  assert.strictEqual(audit.oldAvatarUrl, beforeProfile.avatarUrl);
  assert.strictEqual(audit.newAvatarUrl, nextAvatarUrl);
  checks += 1;

  assert.strictEqual(checks, 13);
  console.log("Coach avatar regression: 13 checks passed");
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
