const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

module.exports.config = {
    title: "مجموعتي",
    release: "1.0",
    clearance: 0,
    author: "ZOTE Tracks",
    summary: "عرض بيانات المجموعة وتصنيفها",
    section: "عـــامـة",
    syntax: "مجموعتي",
    delay: 5,
};

module.exports.ZOTERun = async function({ api, event }) {
  try {
    const thread = await api.getThreadInfo(event.threadID);
    const name = thread.threadName || "بدون اسم";
    const members = thread.participantIDs.length;
    const admins = thread.adminIDs.length;
    const msgCount = thread.messageCount || 0;

    
    let interaction = "";
    if (msgCount >= 10000) interaction = "🔥 *متفاعلة جداً*";
    else if (msgCount >= 3000) interaction = "🙂 *متوسطة التفاعل*";
    else interaction = "💤 *ميّتة شويّة*";

    
    const imgUrl = thread.imageSrc ||
      "https://i.imgur.com/HUS1nK8.png"; 
    const imgDir = path.join(__dirname, "tmp");
    fs.ensureDirSync(imgDir);
    const imgPath = path.join(imgDir, `${event.threadID}.jpg`);
    const res = await axios.get(imgUrl, { responseType: "arraybuffer" });
    fs.writeFileSync(imgPath, Buffer.from(res.data, "binary"));

    
    const msg = `◈ ─────────────── ◈
الاسم: ${name}
عدد الأعضاء: ${members}
عدد الأدمنز: ${admins}
عدد الرسائل: ${msgCount}
تصنيف التفاعل: ${interaction}
◈ ─────────────── ◈
`;

    api.sendMessage(
      { body: msg, attachment: fs.createReadStream(imgPath) },
      event.threadID,
      () => fs.unlinkSync(imgPath),
      event.messageID
    );

  } catch {
    api.sendMessage("حصل خطأ أثناء جلب بيانات المجموعة.", event.threadID, event.messageID);
  }
};
