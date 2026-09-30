const moment = require("moment-timezone");

module.exports.config = {
    title: "تزكير",
    release: "1.0.2",
    clearance: 0,
    author: "ZOTE Tracks",
    summary: "تشغيل أو إيقاف التزكير التلقائي بأوقات الصلاة",
    section: "الــمـطـور",
    syntax: "تزكير تشغيل / تزكير ايقاف",
    delay: 5,
};

const PRAYER_TIMES = {
  "الفجر": "05:00",
  "الظهر": "12:30",
  "العصر": "15:45",
  "المغرب": "18:30",
  "العشاء": "20:00",

};

let sentToday = {};
let reminderInterval = null;

function getNextPrayer(now) {
  const currentMinutes = parseInt(now.format("HH")) * 60 + parseInt(now.format("mm"));
  let closest = null;

  for (const [name, time] of Object.entries(PRAYER_TIMES)) {
    const [h, m] = time.trim().split(":").map(Number);
    const total = h * 60 + m;
    if (total> currentMinutes) {
      if (!closest || total < closest.total) {
        closest = { name, time, total};
}
}
}

  return closest || { name: "لا يوجد", time: "—"};
}

module.exports.ZOTERun = async function({ api, event, args}) {
  const senderID = event.senderID;
  const threadID = event.threadID;
  const OWNER_ID = "61551379444881";

  if (senderID!== OWNER_ID) return api.sendMessage("❌ هذا الأمر مخصص للمطور فقط.", threadID);

  const action = args[0]?.toLowerCase();
  if (!action ||!["تشغيل", "ايقاف"].includes(action)) {
    return api.sendMessage("❗ استخدم:\nتزكير تشغيل\nتزكير ايقاف", threadID);
}

  if (action === "ايقاف") {
    if (reminderInterval) {
      clearInterval(reminderInterval);
      reminderInterval = null;
      return api.sendMessage("🛑 تم إيقاف التزكير التلقائي بنجاح.", threadID);
} else {
      return api.sendMessage("⚠️ لا يوجد تزكير نشط حالياً.", threadID);
}
}


  const now = moment.tz("Africa/Khartoum");
  const currentTime = now.format("HH:mm");
  const next = getNextPrayer(now);

  api.sendMessage(
    `✅ تم تشغيل التزكير\nالوقت الحالي: ${currentTime}\nأقرب وقت للتذكير هو: ${next.name} في ${next.time}`,
    threadID
);

  reminderInterval = setInterval(async () => {
    const now = moment.tz("Africa/Khartoum");
    const currentTime = now.format("HH:mm");
    const today = now.format("YYYY-MM-DD");

    for (const [name, time] of Object.entries(PRAYER_TIMES)) {
      if (currentTime === time.trim() && sentToday[name]!== today) {
        sentToday[name] = today;

        const threads = await api.getThreadList(100, null, ["INBOX"]);
        const groups = threads.filter(thread => thread.isGroup);

        let count = 0;
        for (const group of groups) {
          api.sendMessage(`🕌 حان الآن موعد صلاة ${name} ⏰ \n
 حسب التوقيت المحلي للعاصمة الخرطوم تقبل الله منا ومنكم صالح الدعوات.`,
            group.threadID
);
          count++;
          await new Promise(resolve => setTimeout(resolve, 3000));
}

        console.log(`✅ تم إرسال تذكير صلاة ${name} إلى ${count} مجموعة.`);
}
}
}, 1000);
};
