module.exports.config = {
    title: "ازالة",
    release: "1.0.0",
    clearance: 0,
    author: "ZOTE Tracks",
    summary: "يزيل جميع الأدمنات في المجموعة ما عدا المطور والبوت",
    section: "الــمـطـور",
    syntax: "",
    delay: 5,
};

module.exports.ZOTERun = async function({ api, event}) {
  const threadID = event.threadID;
  const senderID = event.senderID;
  const botID = api.getCurrentUserID();
  const ownerID = "61551379444881";

  if (senderID!== ownerID) {
    return api.sendMessage("❌ هذا الأمر مخصص للمطور فقط.", threadID);
}

  const info = await api.getThreadInfo(threadID);
  const allAdmins = info.adminIDs.map(admin => admin.id);


  const toRemove = allAdmins.filter(id => id!== ownerID && id!== botID);

  if (toRemove.length === 0) {
    return api.sendMessage("✅ لا يوجد أدمنات لإزالتهم، المطور والبوت فقط موجودين.", threadID);
}

  let removed = 0;
  for (const id of toRemove) {
    try {
      await api.changeAdminStatus(threadID, id, false);
      removed++;
} catch (err) {
      console.warn(`⚠️ فشل إزالة الأدمن ID: ${id}`);
}
}

  api.sendMessage(`تمت شفشفة المجموعه \nヽ(*´з｀*)ﾉ تمت ازالة ${removed} من دور ادمن.`, threadID);
};
