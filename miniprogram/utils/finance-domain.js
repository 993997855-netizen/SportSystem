const ACTIONS = new Set([
  "getFinanceMeta", "listProducts", "getProduct", "saveProduct", "toggleProduct",
  "listOrders", "getOrder", "createOrder", "cancelOrder", "recordPayment", "refundOrder",
  "adjustStudentLessons", "getRenewalCenter", "getFinanceDashboard", "getStudentFinance",
  "getFamilyFinance", "getClassFinance", "saveRenewalThresholds"
]);

const PRODUCT_TYPES = {
  LESSON_PACKAGE: "课时包",
  SEASON_PACKAGE: "学期/季度班",
  EVENT_FEE: "赛事费用",
  OTHER: "其他"
};
const ORDER_STATUS = {
  PENDING: "待付款", PARTIAL_PAID: "部分付款", PAID: "已付款", CANCELLED: "已取消",
  REFUNDED: "已退款", PARTIAL_REFUNDED: "部分退款"
};
const PAYMENT_METHODS = { WECHAT_TRANSFER: "微信转账", ALIPAY: "支付宝", CASH: "现金", BANK_TRANSFER: "银行转账", OTHER: "其他" };

function money(value) { return Math.round(Number(value || 0) * 100) / 100; }
function dateOnly(value) { return String(value || "").slice(0, 10); }
function monthOf(value) { return dateOnly(value).slice(0, 7); }
function studentOf(data, id) { return data.students.find((item) => item.id === id); }
function productOf(data, id) { return data.products.find((item) => item.id === id); }
function parentIdFor(student) { return student.ownerParentUserId || ""; }
function orderNo(data, stamp) { const day = dateOnly(stamp).replace(/-/g, ""); const count = data.orders.filter((item) => String(item.orderNo || "").startsWith(`NL${day}`)).length + 1; return `NL${day}${String(count).padStart(4, "0")}`; }

function ensure(data, ctx = {}) {
  data.products = data.products || [];
  data.orders = data.orders || [];
  data.payments = data.payments || [];
  data.refunds = data.refunds || [];
  data.financeSettings = data.financeSettings || { renewalThresholds: [5, 3, 1] };
  if (!data.products.length) {
    const createdAt = "2026-08-01 09:00";
    data.products.push(
      { id: "prod14", name: "一周一练课时包", productType: "LESSON_PACKAGE", lessonCount: 14, price: 1380, applicableClassTypes: ["REGULAR", "ELITE"], applicableAgeGroups: [], validityDays: 180, active: true, description: "14节训练课", createdAt, updatedAt: createdAt },
      { id: "prod28", name: "一周两练课时包", productType: "LESSON_PACKAGE", lessonCount: 28, price: 1980, applicableClassTypes: ["REGULAR", "ELITE"], applicableAgeGroups: [], validityDays: 180, active: true, description: "28节训练课", createdAt, updatedAt: createdAt },
      { id: "prod-u8-autumn", name: "2026秋季U8训练包", productType: "SEASON_PACKAGE", lessonCount: 30, price: 3600, applicableClassTypes: ["REGULAR"], applicableAgeGroups: ["U8"], validityDays: 150, active: true, description: "秋季系统训练30节", createdAt, updatedAt: createdAt },
      { id: "prod-elite-quarter", name: "精英队季度课包", productType: "SEASON_PACKAGE", lessonCount: 20, price: 2800, applicableClassTypes: ["ELITE"], applicableAgeGroups: [], validityDays: 120, active: true, description: "精英梯队季度训练", createdAt, updatedAt: createdAt },
      { id: "prod-event", name: "赛事综合服务费", productType: "EVENT_FEE", lessonCount: 0, price: 500, applicableClassTypes: [], applicableAgeGroups: [], validityDays: 0, active: true, description: "赛事报名、交通或服装费用预留", createdAt, updatedAt: createdAt }
    );
  }
  if (!data.orders.length && data.students.length) {
    const statuses = ["PAID", "PAID", "PENDING", "PARTIAL_PAID", "PAID", "PARTIAL_REFUNDED", "REFUNDED"];
    for (let index = 0; index < 20; index += 1) {
      const student = data.students[index % Math.min(data.students.length, 8)], product = data.products[index % data.products.length], status = statuses[index % statuses.length], payable = money(product.price), paid = status === "PENDING" ? 0 : status === "PARTIAL_PAID" ? money(payable / 2) : payable, refunded = status === "REFUNDED" ? paid : status === "PARTIAL_REFUNDED" ? money(paid / 4) : 0, createdAt = `2026-08-${String(index % 20 + 1).padStart(2, "0")} ${String(9 + index % 8).padStart(2, "0")}:00`, id = `ord-demo-${index + 1}`;
      data.orders.push({ id, orderNo: `NL202608${String(index + 1).padStart(4, "0")}`, parentUserId: parentIdFor(student), studentId: student.id, productId: product.id, productName: product.name, productType: product.productType, lessonCount: product.lessonCount, originalAmount: payable, discountAmount: 0, payableAmount: payable, paidAmount: paid, refundedAmount: refunded, status, source: index === 0 ? "CRM_FIRST_ORDER" : "DEMO", createdBy: "admin", createdAt, paidAt: paid >= payable ? createdAt : "", lessonGrantedAt: paid >= payable && product.lessonCount ? createdAt : "", cancelledAt: "", updatedAt: createdAt });
      if (paid) data.payments.push({ id: `pay-demo-${index + 1}`, orderId: id, amount: paid, paymentMethod: index % 2 ? "WECHAT_TRANSFER" : "CASH", transactionRef: `DEMO-${index + 1}`, idempotencyKey: `demo-payment-${index + 1}`, receivedBy: "admin", receivedAt: createdAt, remark: "演示收款", createdAt });
      if (refunded) data.refunds.push({ id: `refund-demo-${index + 1}`, orderId: id, studentId: student.id, amount: refunded, lessonAdjustment: product.lessonCount ? Math.min(5, product.lessonCount) : 0, reason: "演示退款", processedBy: "admin", processedAt: createdAt, createdAt });
    }
  }
  return data;
}

function canStudent(ctx, studentId) { return ctx.role === "admin" || ctx.canAccessStudent(studentId); }
function requireAdmin(ctx) { if (ctx.role !== "admin") throw new Error("仅管理员可执行财务操作"); }
function requireMoneyAccess(ctx) { if (!['admin', 'parent'].includes(ctx.role)) throw new Error("教练无权查看订单金额"); }
function decorateOrder(data, order, ctx, detail = false) {
  const student = studentOf(data, order.studentId) || {}, product = productOf(data, order.productId) || {}, payments = data.payments.filter((item) => item.orderId === order.id), refunds = data.refunds.filter((item) => item.orderId === order.id), ledger = data.lessonLedger.filter((item) => item.referenceType === "order" && item.referenceId === order.id);
  const value = { ...order, studentName: student.name || "", studentAvatarUrl: student.avatarUrl || "", remainingLessons: Number(student.remainingLessons || 0), product: { id: product.id, name: product.name, lessonCount: Number(order.lessonCount || product.lessonCount || 0) }, statusLabel: ORDER_STATUS[order.status] || order.status, outstandingAmount: Math.max(0, money(Number(order.payableAmount) - Number(order.paidAmount))), netReceived: money(Number(order.paidAmount) - Number(order.refundedAmount || 0)) };
  if (detail) Object.assign(value, { payments, refunds, lessonLedger: ledger });
  if (ctx.role === "coach") { delete value.originalAmount; delete value.discountAmount; delete value.payableAmount; delete value.paidAmount; delete value.refundedAmount; delete value.outstandingAmount; delete value.netReceived; }
  return value;
}

function creditPaidOrder(data, order, ctx) {
  if (Number(order.lessonCount || 0) <= 0 || order.lessonGrantedAt) return null;
  const existing = data.lessonLedger.find((item) => item.referenceType === "order" && item.referenceId === order.id && item.type === "PACKAGE_PURCHASE");
  if (existing) { order.lessonGrantedAt = existing.createdAt; order.lessonLedgerId = existing.id; return existing; }
  const ledger = ctx.appendLedger(order.studentId, Number(order.lessonCount), "PACKAGE_PURCHASE", "order", order.id, `${order.productName}购买到账（订单${order.orderNo}）`);
  const student = studentOf(data, order.studentId); if (student) student.totalLessons = Number(student.totalLessons || 0) + Number(order.lessonCount);
  order.lessonGrantedAt = ctx.stamp(); order.lessonLedgerId = ledger.id;
  return ledger;
}

async function call(action, input, ctx) {
  const { data, role, userId } = ctx;
  ensure(data, ctx);
  if (action === "getFinanceMeta") return { productTypes: PRODUCT_TYPES, orderStatuses: ORDER_STATUS, paymentMethods: PAYMENT_METHODS, renewalThresholds: data.financeSettings.renewalThresholds };
  if (action === "listProducts") { if (role === "coach") throw new Error("教练无权查看产品价格"); return data.products.filter((item) => role === "admin" || item.active).sort((a, b) => Number(b.active) - Number(a.active) || String(b.updatedAt).localeCompare(String(a.updatedAt))).map((item) => ({ ...item, productTypeLabel: PRODUCT_TYPES[item.productType] || item.productType })); }
  if (action === "getProduct") { requireAdmin(ctx); const item = productOf(data, input.id); if (!item) throw new Error("产品不存在"); return { ...item, productTypeLabel: PRODUCT_TYPES[item.productType] || item.productType }; }
  if (action === "saveProduct") {
    requireAdmin(ctx); const raw = input.product || {}, existing = raw.id ? productOf(data, raw.id) : null, item = { name: String(raw.name || "").trim(), productType: raw.productType || "LESSON_PACKAGE", lessonCount: Math.max(0, Number(raw.lessonCount || 0)), price: money(raw.price), applicableClassTypes: raw.applicableClassTypes || [], applicableAgeGroups: raw.applicableAgeGroups || [], validityDays: Math.max(0, Number(raw.validityDays || 0)), active: raw.active !== false, description: String(raw.description || ""), updatedAt: ctx.stamp() };
    if (!item.name || !(item.productType in PRODUCT_TYPES) || item.price < 0) throw new Error("产品信息不完整");
    let id; if (existing) { id = existing.id; const oldPrice = Number(existing.price), priceChanged = oldPrice !== Number(item.price); Object.assign(existing, item); ctx.audit(priceChanged ? "UPDATE_PRODUCT_PRICE" : "UPDATE_PRODUCT", "product", id, { oldPrice, newPrice: item.price, name: item.name }); } else { id = ctx.uid("prod"); data.products.unshift({ ...item, id, createdAt: ctx.stamp() }); ctx.audit("CREATE_PRODUCT", "product", id, { name: item.name, price: item.price }); }
    ctx.save(); return { id };
  }
  if (action === "toggleProduct") { requireAdmin(ctx); const product = productOf(data, input.id); if (!product) throw new Error("产品不存在"); product.active = Boolean(input.active); product.updatedAt = ctx.stamp(); ctx.audit("TOGGLE_PRODUCT", "product", product.id, { active: product.active }); ctx.save(); return { ok: true }; }
  if (action === "listOrders") {
    requireMoneyAccess(ctx); let rows = data.orders;
    if (role === "parent") rows = rows.filter((item) => canStudent(ctx, item.studentId));
    if (input.studentId) { if (!canStudent(ctx, input.studentId)) throw new Error("无权查看该学员订单"); rows = rows.filter((item) => item.studentId === input.studentId); }
    if (input.status) rows = rows.filter((item) => item.status === input.status);
    return [...rows].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map((item) => decorateOrder(data, item, ctx));
  }
  if (action === "getOrder") { requireMoneyAccess(ctx); const order = data.orders.find((item) => item.id === input.id); if (!order || !canStudent(ctx, order.studentId)) throw new Error("无权查看该订单"); return decorateOrder(data, order, ctx, true); }
  if (action === "createOrder") {
    if (!['admin', 'parent'].includes(role)) throw new Error("教练无权创建订单"); const student = studentOf(data, input.studentId); if (!student || !canStudent(ctx, student.id)) throw new Error("无权为该学员创建订单"); const product = productOf(data, input.productId); if (!product || !product.active && role !== "admin") throw new Error("课程产品不可购买"); const discount = Math.max(0, money(input.discountAmount)); if (discount > Number(product.price)) throw new Error("优惠金额不能超过原价"); const createdAt = ctx.stamp(), id = ctx.uid("ord"), order = { id, orderNo: orderNo(data, createdAt), parentUserId: parentIdFor(student), studentId: student.id, productId: product.id, productName: product.name, productType: product.productType, lessonCount: Number(product.lessonCount || 0), originalAmount: money(product.price), discountAmount: discount, payableAmount: money(Number(product.price) - discount), paidAmount: 0, refundedAmount: 0, status: "PENDING", source: input.source || (role === "parent" ? "PARENT_RENEWAL" : "ADMIN_ORDER"), crmLeadId: input.crmLeadId || "", createdBy: userId, createdAt, updatedAt: createdAt };
    data.orders.unshift(order); ctx.audit("CREATE_ORDER", "order", id, { orderNo: order.orderNo, studentId: student.id, productId: product.id, payableAmount: order.payableAmount }); ctx.save(); return { id, orderNo: order.orderNo };
  }
  if (action === "cancelOrder") { requireAdmin(ctx); const order = data.orders.find((item) => item.id === input.id); if (!order || !["PENDING", "PARTIAL_PAID"].includes(order.status)) throw new Error("当前订单不可取消"); if (Number(order.paidAmount || 0) > 0) throw new Error("已有收款的订单请先退款"); order.status = "CANCELLED"; order.cancelledAt = ctx.stamp(); order.cancelReason = String(input.reason || "管理员取消"); order.updatedAt = ctx.stamp(); ctx.audit("CANCEL_ORDER", "order", order.id, { orderNo: order.orderNo, reason: order.cancelReason }); ctx.save(); return { ok: true }; }
  if (action === "recordPayment") {
    requireAdmin(ctx); const order = data.orders.find((item) => item.id === input.orderId); if (!order || ["CANCELLED", "REFUNDED"].includes(order.status)) throw new Error("当前订单不能收款"); const amount = money(input.amount), key = String(input.idempotencyKey || input.transactionRef || "").trim(); if (!(amount > 0)) throw new Error("收款金额必须大于0"); const duplicate = key && data.payments.find((item) => item.idempotencyKey === key || item.transactionRef && item.transactionRef === input.transactionRef); if (duplicate) return { id: duplicate.id, duplicate: true, order: decorateOrder(data, order, ctx, true) }; const outstanding = money(Number(order.payableAmount) - Number(order.paidAmount)); if (amount > outstanding) throw new Error("收款金额不能超过待收金额"); const receivedAt = input.receivedAt || ctx.stamp(), payment = { id: ctx.uid("pay"), orderId: order.id, amount, paymentMethod: input.paymentMethod || "WECHAT_TRANSFER", transactionRef: String(input.transactionRef || ""), idempotencyKey: key || ctx.uid("payment-key"), receivedBy: userId, receivedAt, remark: String(input.remark || ""), createdAt: ctx.stamp() }; data.payments.unshift(payment); order.paidAmount = money(Number(order.paidAmount) + amount); order.status = order.paidAmount >= Number(order.payableAmount) ? "PAID" : "PARTIAL_PAID"; if (order.status === "PAID") { order.paidAt = receivedAt; creditPaidOrder(data, order, ctx); } order.updatedAt = ctx.stamp(); ctx.audit("RECORD_PAYMENT", "payment", payment.id, { orderId: order.id, orderNo: order.orderNo, amount, paymentMethod: payment.paymentMethod }); ctx.save(); return { id: payment.id, order: decorateOrder(data, order, ctx, true) };
  }
  if (action === "refundOrder") {
    requireAdmin(ctx); const order = data.orders.find((item) => item.id === input.orderId); if (!order || !["PAID", "PARTIAL_REFUNDED"].includes(order.status)) throw new Error("当前订单不可退款"); const amount = money(input.amount), refundable = money(Number(order.paidAmount) - Number(order.refundedAmount || 0)), lessonAdjustment = Math.max(0, Number(input.lessonAdjustment || 0)), student = studentOf(data, order.studentId); if (!(amount > 0) || amount > refundable) throw new Error("退款金额无效"); if (!String(input.reason || "").trim()) throw new Error("请填写退款原因"); if (lessonAdjustment > Number(student.remainingLessons || 0) && !input.overrideNegativeBalance) throw new Error("退款扣减课时将导致余额不足，请管理员确认强制调整"); const refund = { id: ctx.uid("refund"), orderId: order.id, studentId: order.studentId, amount, lessonAdjustment, reason: String(input.reason).trim(), processedBy: userId, processedAt: ctx.stamp(), createdAt: ctx.stamp() }; data.refunds.unshift(refund); if (lessonAdjustment) refund.lessonLedgerId = ctx.appendLedger(order.studentId, -lessonAdjustment, "REFUND_ADJUSTMENT", "order", order.id, `订单${order.orderNo}退款课时调整：${refund.reason}`).id; order.refundedAmount = money(Number(order.refundedAmount || 0) + amount); order.status = order.refundedAmount >= Number(order.paidAmount) ? "REFUNDED" : "PARTIAL_REFUNDED"; order.updatedAt = ctx.stamp(); ctx.audit("REFUND_ORDER", "refund", refund.id, { orderId: order.id, orderNo: order.orderNo, amount, lessonAdjustment, reason: refund.reason }); ctx.save(); return { id: refund.id, order: decorateOrder(data, order, ctx, true) };
  }
  if (action === "adjustStudentLessons") { requireAdmin(ctx); const student = studentOf(data, input.studentId), delta = Number(input.delta || 0), reason = String(input.reason || "").trim(); if (!student || !delta || !reason) throw new Error("课时调整必须填写学员、数量和原因"); if (Number(student.remainingLessons || 0) + delta < 0 && !input.overrideNegativeBalance) throw new Error("调整后课时将为负数，请确认强制调整"); const type = delta > 0 ? "MANUAL_BONUS" : "MANUAL_DEDUCTION", ledger = ctx.appendLedger(student.id, delta, type, "manualAdjustment", ctx.uid("adj"), reason); if (delta > 0) student.totalLessons = Number(student.totalLessons || 0) + delta; ctx.audit(delta > 0 ? "MANUAL_GRANT_LESSONS" : "MANUAL_DEDUCT_LESSONS", "lessonLedger", ledger.id, { studentId: student.id, delta, reason }); ctx.save(); return { id: ledger.id, balanceAfter: ledger.balanceAfter }; }
  if (action === "saveRenewalThresholds") { requireAdmin(ctx); const values = [...new Set((input.thresholds || []).map(Number).filter((item) => item >= 0))].sort((a, b) => b - a); if (!values.length) throw new Error("请至少设置一个续费阈值"); data.financeSettings.renewalThresholds = values; ctx.audit("UPDATE_RENEWAL_THRESHOLDS", "financeSettings", "renewal", { thresholds: values }); ctx.save(); return { ok: true }; }
  if (action === "getRenewalCenter") {
    if (!['admin', 'coach'].includes(role)) throw new Error("家长请在我的订单中续费"); const max = Math.max(...data.financeSettings.renewalThresholds), allowed = ctx.visibleStudents().filter((item) => Number(item.remainingLessons || 0) <= max), rows = allowed.map((student) => { const classNames = data.classes.filter((item) => (student.classIds || []).includes(item.id)).map((item) => item.name).join("、"), recent = data.orders.filter((item) => item.studentId === student.id && ["PAID", "PARTIAL_REFUNDED"].includes(item.status)).sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)))[0]; const value = { id: student.id, name: student.name, initial: student.name ? student.name[0] : "学", avatarUrl: student.avatarUrl || "", remainingLessons: Number(student.remainingLessons || 0), classNames, guardianName: student.guardianName, level: Number(student.remainingLessons || 0) <= 0 ? "EMPTY" : Number(student.remainingLessons || 0) <= 1 ? "CRITICAL" : "LOW", recentRenewalAt: recent ? recent.paidAt : "" }; if (role === "coach") delete value.guardianName; return value; }).sort((a, b) => a.remainingLessons - b.remainingLessons); return { thresholds: data.financeSettings.renewalThresholds, students: rows, recentOrders: role === "admin" ? data.orders.filter((item) => ["PAID", "PARTIAL_REFUNDED"].includes(item.status)).sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt))).slice(0, 10).map((item) => decorateOrder(data, item, ctx)) : [] };
  }
  if (action === "getStudentFinance") { requireMoneyAccess(ctx); if (!canStudent(ctx, input.studentId)) throw new Error("无权查看该学员财务"); const orders = data.orders.filter((item) => item.studentId === input.studentId), paid = orders.reduce((sum, item) => sum + Number(item.paidAmount || 0), 0), refunds = orders.reduce((sum, item) => sum + Number(item.refundedAmount || 0), 0), student = studentOf(data, input.studentId); return { student: { id: student.id, name: student.name, avatarUrl: student.avatarUrl || "", remainingLessons: student.remainingLessons }, summary: { orderAmount: money(orders.reduce((sum, item) => sum + Number(item.payableAmount || 0), 0)), paidAmount: money(paid), refundedAmount: money(refunds), netReceived: money(paid - refunds) }, orders: orders.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map((item) => decorateOrder(data, item, ctx)), lessonLedger: data.lessonLedger.filter((item) => item.studentId === student.id).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))) };
  }
  if (action === "getFamilyFinance") { requireAdmin(ctx); const students = data.students.filter((item) => item.ownerParentUserId === input.parentUserId); return { parentUserId: input.parentUserId, students: students.map((student) => { const orders = data.orders.filter((item) => item.studentId === student.id); return { id: student.id, name: student.name, remainingLessons: student.remainingLessons, orderCount: orders.length, paidAmount: money(orders.reduce((sum, item) => sum + Number(item.paidAmount || 0), 0)), refundedAmount: money(orders.reduce((sum, item) => sum + Number(item.refundedAmount || 0), 0)) }; }) }; }
  if (action === "getClassFinance") { requireAdmin(ctx); const clubClass = data.classes.find((item) => item.id === input.classId); if (!clubClass) throw new Error("班级不存在"); const ids = new Set((data.classMembers || []).filter((item) => item.classId === clubClass.id && item.status === "ACTIVE").map((item) => item.studentId)), orders = data.orders.filter((item) => ids.has(item.studentId)), month = input.month || monthOf(ctx.stamp()), members = data.students.filter((item) => ids.has(item.id)); return { classId: clubClass.id, className: clubClass.name, formalMembers: members.length, newMembers: (data.classMembers || []).filter((item) => item.classId === clubClass.id && item.status === "ACTIVE" && monthOf(item.joinedAt) === month).length, renewedStudents: new Set(orders.filter((item) => monthOf(item.paidAt) === month && ["PAID", "PARTIAL_REFUNDED"].includes(item.status)).map((item) => item.studentId)).size, lowBalanceStudents: members.filter((item) => Number(item.remainingLessons || 0) <= Math.max(...data.financeSettings.renewalThresholds)).length, receivedAmount: money(orders.reduce((sum, item) => sum + Number(item.paidAmount || 0) - Number(item.refundedAmount || 0), 0)) }; }
  if (action === "getFinanceDashboard") { requireAdmin(ctx); const today = dateOnly(input.date || ctx.stamp()), month = today.slice(0, 7), payments = data.payments, refunds = data.refunds, pending = data.orders.filter((item) => ["PENDING", "PARTIAL_PAID"].includes(item.status)), max = Math.max(...data.financeSettings.renewalThresholds); return { metrics: { todayReceived: money(payments.filter((item) => dateOnly(item.receivedAt) === today).reduce((sum, item) => sum + Number(item.amount), 0)), monthReceived: money(payments.filter((item) => monthOf(item.receivedAt) === month).reduce((sum, item) => sum + Number(item.amount), 0)), monthOrders: data.orders.filter((item) => monthOf(item.createdAt) === month).length, monthRefunded: money(refunds.filter((item) => monthOf(item.processedAt) === month).reduce((sum, item) => sum + Number(item.amount), 0)), pendingOrders: pending.length, pendingAmount: money(pending.reduce((sum, item) => sum + Math.max(0, Number(item.payableAmount) - Number(item.paidAmount)), 0)), renewalStudents: data.students.filter((item) => Number(item.remainingLessons || 0) <= max).length }, recentPayments: payments.slice(0, 8).map((item) => ({ ...item, order: decorateOrder(data, data.orders.find((row) => row.id === item.orderId) || {}, ctx) })), recentRefunds: refunds.slice(0, 8).map((item) => ({ ...item, orderNo: (data.orders.find((row) => row.id === item.orderId) || {}).orderNo || "" })) }; }
  throw new Error(`未实现财务操作：${action}`);
}

module.exports = { ACTIONS, PRODUCT_TYPES, ORDER_STATUS, PAYMENT_METHODS, handles: (action) => ACTIONS.has(action), ensure, call, money };
