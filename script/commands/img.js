const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");

module.exports.config = {
    title: "ايمج",
    release: "1.2",
    clearance: 0,
    author: "ZOTE Tracks",
    summary: "رفع الصور من الرد على صورة مباشرة وحفظها باسم داخل مجلد img",
    section: "الــمـطـور",
    syntax: ".ارفع اسم.png (رد على صورة)",
    delay: 5,
};

module.exports.ZOTERun = async ({ api, event}) => {
  const { threadID, messageID, senderID, body, messageReply} = event;

  if (senderID!== "61551379444881") {
    return api.sendMessage("❌ هذا الأمر مخصص فقط للرجال.", threadID, messageID);
}

  const args = body.trim().split(" ");
  const command = args[1];

  const imgFolder = path.join(__dirname, "img");
  if (!fs.existsSync(imgFolder)) {
    fs.mkdirSync(imgFolder);
}


  if (command === "عرض") {
    const files = fs.readdirSync(imgFolder).filter(file => file.endsWith(".png"));
    if (files.length === 0) return api.sendMessage("📂 لا توجد صور محفوظة.", threadID, messageID);
    const list = files.map((f, i) => `${i + 1}. ${f}`).join("\n");
    return api.sendMessage(`🖼️ الصور المحفوظة:\n${list}`, threadID, messageID);
}


  if (command === "جيب") {
    const imageName = args.slice(2).join(" ").trim();
    const imagePath = path.join(imgFolder, imageName);
    if (!fs.existsSync(imagePath)) {
      return api.sendMessage("❌ الصورة غير موجودة.", threadID, messageID);
}

    return api.sendMessage(
      { body: `🖼️ الصورة: ${imageName}`, attachment: fs.createReadStream(imagePath)},
      threadID,
      messageID
);
}


  const imageName = args.slice(1).join(" ").trim();
  if (!imageName.endsWith(".png")) {
    return api.sendMessage(" لازم يكون الاسم منتهي بـ.png", threadID, messageID);
}

  if (!messageReply ||!messageReply.attachments || messageReply.attachments.length === 0 || messageReply.attachments[0].type!== "photo") {
    return api.sendMessage("⚠️ لازم ترد على صورة عشان أرفعها.", threadID, messageID);
}

  const imagePath = path.join(imgFolder, imageName);

  try {
    const imageBuffer = (await axios.get(messageReply.attachments[0].url, { responseType: "arraybuffer"})).data;
    fs.writeFileSync(imagePath, Buffer.from(imageBuffer));
    return api.sendMessage(`✅ تم رفع الصورة باسم: ${imageName}`, threadID, messageID);
} catch (err) {
    console.error("❌ خطأ في رفع الصورة:", err.message);
    return api.sendMessage(`❌ فشل في رفع الصورة:\n${err.message}`, threadID, messageID);
}
};
