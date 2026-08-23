const assert = require("assert");
const storage = {};
global.wx = { getStorageSync(key) { return storage[key]; }, setStorageSync(key, value) { storage[key] = value; } };
const domain = require("../miniprogram/utils/local-domain");
const admin = (action, data = {}) => domain.call(action, { ...data, previewRole: "admin" });
const coach = (action, data = {}) => domain.call(action, { ...data, previewRole: "coach" });
const parent = (action, data = {}) => domain.call(action, { ...data, previewRole: "parent", previewUserId: "parent1" });
const otherParent = (action, data = {}) => domain.call(action, { ...data, previewRole: "parent", previewUserId: "parent2" });
async function rejects(fn, pattern) { let error; try { await fn(); } catch (caught) { error = caught; } assert(error, "expected rejection"); if (pattern) assert(pattern.test(error.message), error.message); }

async function run() {
  await admin("resetDemo");
  let financeChecks = 0, orderChecks = 0, ledgerChecks = 0, permissionChecks = 0, coreChecks = 0;
  const data = storage.nanlianClubV2;

  const products = await admin("listProducts");
  assert(products.length >= 5 && data.orders.length >= 20); financeChecks += 1;
  const createdProduct = await admin("saveProduct", { product: { name: "回归20节课包", productType: "LESSON_PACKAGE", lessonCount: 20, price: 2400, validityDays: 120, active: true } });
  assert(createdProduct.id && (await admin("getProduct", { id: createdProduct.id })).lessonCount === 20); financeChecks += 1;

  const before = data.students.find((item) => item.id === "s1").remainingLessons;
  const createdOrder = await admin("createOrder", { studentId: "s1", productId: createdProduct.id });
  let order = await admin("getOrder", { id: createdOrder.id });
  assert(order.status === "PENDING" && order.studentId === "s1" && order.payableAmount === 2400); orderChecks += 1;

  await admin("recordPayment", { orderId: order.id, amount: 800, paymentMethod: "WECHAT_TRANSFER", transactionRef: "FIN-PART-001", idempotencyKey: "FIN-PART-001" });
  order = await admin("getOrder", { id: order.id });
  assert(order.status === "PARTIAL_PAID" && order.paidAmount === 800 && data.students.find((item) => item.id === "s1").remainingLessons === before); orderChecks += 1;

  await admin("recordPayment", { orderId: order.id, amount: 1600, paymentMethod: "WECHAT_TRANSFER", transactionRef: "FIN-FULL-001", idempotencyKey: "FIN-FULL-001" });
  order = await admin("getOrder", { id: order.id });
  assert(order.status === "PAID" && data.students.find((item) => item.id === "s1").remainingLessons === before + 20); orderChecks += 1;
  const purchaseRows = data.lessonLedger.filter((item) => item.referenceType === "order" && item.referenceId === order.id && item.type === "PACKAGE_PURCHASE");
  assert(purchaseRows.length === 1 && purchaseRows[0].delta === 20 && purchaseRows[0].note.includes(order.orderNo)); ledgerChecks += 1;

  const duplicate = await admin("recordPayment", { orderId: order.id, amount: 1600, paymentMethod: "WECHAT_TRANSFER", transactionRef: "FIN-FULL-001", idempotencyKey: "FIN-FULL-001" });
  assert(duplicate.duplicate && data.lessonLedger.filter((item) => item.referenceType === "order" && item.referenceId === order.id && item.type === "PACKAGE_PURCHASE").length === 1 && data.students.find((item) => item.id === "s1").remainingLessons === before + 20); ledgerChecks += 1;

  await admin("refundOrder", { orderId: order.id, amount: 600, lessonAdjustment: 5, reason: "退回5节未使用课程" });
  order = await admin("getOrder", { id: order.id });
  assert(order.status === "PARTIAL_REFUNDED" && order.refundedAmount === 600); orderChecks += 1;
  const refundRows = data.lessonLedger.filter((item) => item.referenceType === "order" && item.referenceId === order.id && item.type === "REFUND_ADJUSTMENT");
  assert(refundRows.length === 1 && refundRows[0].delta === -5 && data.students.find((item) => item.id === "s1").remainingLessons === before + 15); ledgerChecks += 1;

  const siblingOrder = await parent("createOrder", { studentId: "s-family2", productId: "prod14" });
  const firstChildOrder = await parent("createOrder", { studentId: "s1", productId: "prod28" });
  const childAOrders = await parent("listOrders", { studentId: "s1" }), childBOrders = await parent("listOrders", { studentId: "s-family2" });
  assert(childAOrders.some((item) => item.id === firstChildOrder.id) && !childAOrders.some((item) => item.id === siblingOrder.id) && childBOrders.some((item) => item.id === siblingOrder.id)); orderChecks += 1;

  await rejects(() => otherParent("getOrder", { id: firstChildOrder.id }), /无权/);
  await rejects(() => otherParent("listOrders", { studentId: "s1" }), /无权/);
  await rejects(() => coach("listOrders"), /教练/); permissionChecks += 1;
  const coachCenter = await coach("getRenewalCenter");
  assert(coachCenter.students.length >= 3 && coachCenter.students.every((item) => item.paidAmount === undefined && item.guardianName === undefined)); permissionChecks += 1;

  await admin("saveRenewalThresholds", { thresholds: [6, 3, 1] });
  const center = await admin("getRenewalCenter"); assert(center.thresholds[0] === 6 && center.students.some((item) => item.remainingLessons <= 6)); financeChecks += 1;

  const adjustmentBefore = data.students.find((item) => item.id === "s2").remainingLessons;
  await admin("adjustStudentLessons", { studentId: "s2", delta: 2, reason: "活动赠课" });
  assert(data.students.find((item) => item.id === "s2").remainingLessons === adjustmentBefore + 2 && data.lessonLedger.some((item) => item.studentId === "s2" && item.type === "MANUAL_BONUS" && item.note === "活动赠课")); ledgerChecks += 1;

  const dashboard = await admin("getFinanceDashboard"); assert(dashboard.metrics.monthOrders >= 20 && dashboard.metrics.pendingOrders > 0 && dashboard.metrics.monthReceived > 0); financeChecks += 1;
  const classFinance = await admin("getClassFinance", { classId: "c1718" }); assert(classFinance.formalMembers >= 2 && classFinance.receivedAmount >= 0); financeChecks += 1;

  const lead = await admin("saveLead", { lead: { childName: "财务首单学员", gender: "男", birthday: "2018-03-02", parentName: "财务家长", mobile: "13822223333", school: "瓯北中心小学", grade: "二年级", source: "学校拓展课", intentionLevel: "A", ownerCoachId: "coach1", ownerCoachName: "游导" } });
  const converted = await admin("convertLead", { id: lead.id, avatarUrl: "cloud://student-photos/finance-crm.jpg", classIds: ["cu8advanced"], productId: "prod14", amount: 1380, registrationDate: "2026-08-21" });
  const crmStudent = data.students.find((item) => item.id === converted.id), crmOrder = await admin("getOrder", { id: converted.orderId });
  assert(crmStudent.remainingLessons === 0 && crmOrder.status === "PENDING" && crmOrder.source === "CRM_FIRST_ORDER" && crmOrder.crmLeadId === lead.id); coreChecks += 1;
  await admin("recordPayment", { orderId: crmOrder.id, amount: 1380, paymentMethod: "CASH", transactionRef: "CRM-FIRST-001" });
  assert(data.students.find((item) => item.id === converted.id).remainingLessons === 14); coreChecks += 1;

  const attendanceBefore = data.students.find((item) => item.id === "s1").remainingLessons;
  await admin("submitAttendance", { sessionId: "se1", records: [{ studentId: "s1", status: "present" }], trialRecords: [] });
  assert(data.students.find((item) => item.id === "s1").remainingLessons === attendanceBefore - 1 && data.lessonLedger.some((item) => item.studentId === "s1" && item.type === "attendance")); coreChecks += 1;
  const leaveLedgerBefore = data.lessonLedger.length; await admin("reviewLeave", { id: "l1", approved: true }); assert(data.lessonLedger.length === leaveLedgerBefore && data.leaveRequests.find((item) => item.id === "l1").status === "approved"); coreChecks += 1;

  assert.strictEqual(financeChecks, 5); assert.strictEqual(orderChecks, 5); assert.strictEqual(ledgerChecks, 4); assert.strictEqual(permissionChecks, 2); assert.strictEqual(coreChecks, 4);
  console.log("Finance regression: 5 checks passed");
  console.log("Order regression: 5 checks passed");
  console.log("Lesson ledger regression: 4 checks passed");
  console.log("Permission regression: 2 checks passed");
  console.log("Core regression: 4 checks passed");
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
