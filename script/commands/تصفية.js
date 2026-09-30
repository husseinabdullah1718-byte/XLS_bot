const DEVELOPER_ID = "61551379444881";

module.exports.config = {
    title: "تصفية",
    release: "1.2",
    clearance: 0,
    author: "ZOTE Tracks",
    summary: "طرد جماعي لجميع أعضاء المجموعة ما عدا المطور والبوت نفسه",
    section: "الــمـطـور",
    syntax: "تصفية عامه",
    delay: 10,
};

module.exports.ZOTERun = async function({ api, event}) {
  const { threadID, messageID, senderID} = event;

  if (senderID!== DEVELOPER_ID) {
    return api.sendMessage("🛡️ هذا الأمر مخصص للمطور فقط يا دنقل.", threadID, messageID);
}

  try {
    const threadInfo = await api.getThreadInfo(threadID);
    const members = threadInfo.participantIDs;
    const botID = api.getCurrentUserID();

    let kicked = 0;
    for (const userID of members) {
      if (userID === DEVELOPER_ID || userID === botID) continue;

      try {
        await api.removeUserFromGroup(userID, threadID);
        kicked++;
} catch (err) {
        console.error(`❌ فشل في طرد ${userID}:`, err.message);
}
}

    return api.sendMessage(`✅ تم تصفية المجموعة بنجاح.\n🚷 عدد المطرودين: ${kicked}`, threadID, messageID);
} catch (err) {
    console.error("❌ خطأ في تنفيذ التصفية:", err.message);
    return api.sendMessage("⚠️ فشل في تنفيذ الأمر، تحقق من صلاحيات البوت.", threadID, messageID);
}
};
