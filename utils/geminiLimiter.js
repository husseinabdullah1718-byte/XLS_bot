// ============================================================
//  حد أقصى مشترك لطلبات Gemini في الدقيقة
//  يُستخدم من أكثر من ملف (حماية.js، احترام.js...) حتى لا
//  يتجاوز مجموع الطلبات من كل الملفات حد الخطة المجانية
//  ويسبب أخطاء 429 متكررة. القيمة محافِظة عمداً.
// ============================================================

const MAX_REQUESTS_PER_MINUTE = 8;
const timestamps = [];

function canCallGeminiNow() {
    const now = Date.now();
    while (timestamps.length && now - timestamps[0] > 60000) {
        timestamps.shift();
    }
    if (timestamps.length >= MAX_REQUESTS_PER_MINUTE) return false;
    timestamps.push(now);
    return true;
}

module.exports = { canCallGeminiNow };
