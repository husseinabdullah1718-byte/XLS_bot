module.exports.config = {
    title: "مسح",
    release: "1.0.1",
    clearance: 1,
    author: "ZOTE Tracks",
    summary: "ا",
    section: "عـــامـة",
    syntax: "حذف رسائل البوت",
    delay: 0,
};

module.exports.languages = {
    "vi": {
        "returnCant": "Không thể gỡ tin nhắn của người khác.",
        "missingReply": "Hãy reply tin nhắn cần gỡ."
    },
    "en": {
        "returnCant": "اقول تدخل حسابه وتحذفها 🙂🗡️",
        "missingReply": "رد عا رسالتي 🙂"
    }
}

module.exports.ZOTERun = function({ api, event }) {
    if (event.type != "message_reply") return api.sendMessage("رد عا رسالتي 🙂", event.threadID, event.messageID);
    if (event.messageReply.senderID != api.getCurrentUserID()) return api.sendMessage("اقول تدخل حسابه وتحذفها 🙂🗡️", event.threadID, event.messageID);
    return api.unsendMessage(event.messageReply.messageID, event.threadID);
}
