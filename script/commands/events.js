const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

module.exports.config = {
    title: "احداث",
    release: "2.1.0",
    clearance: 1,
    author: "ZOTE Tracks",
    summary: "إرسال رسالة ترحيب عند انضمام أعضاء جدد",
    section: "الــمـطـور",
    syntax: "on/off",
    delay: 5,
};

function getFormattedDate() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

async function getAvatarUrl(userID) {
    try {
        const user = await axios.post(`https://www.facebook.com/api/graphql/`, null, {
            params: {
                doc_id: "5341536295888250",
                variables: JSON.stringify({ height: 512, scale: 1, userID, width: 512 })
            }
        });
        return user.data.data.profile.profile_picture.uri;
    } catch (err) {
        return "https://i.ibb.co/bBSpr5v/143086968-2856368904622192-1959732218791162458-n.png";
    }
}

module.exports.ZOTEEvent = async function({ api, event }) {
    const { logMessageType, logMessageData, author, threadID } = event;
    const botID = api.getCurrentUserID();
    const config = Zote.client.config;
    const prefix = config.PREFIX || " ";
    const botName = config.BOTNAME || "Zote Bot";
    const currentTime = getFormattedDate();

    if (author === botID) return;

    try {
        switch (logMessageType) {
            case "log:subscribe": {
                // تم إضافة البوت نفسه
                if (logMessageData.addedParticipants.some(p => p.userFbId === botID)) {
                    try {
                        await api.changeNickname(`[ ${prefix} ] ◈ ${botName}`, threadID, botID);
                    } catch(e) {}

                    const threadInfo = await api.getThreadInfo(threadID);
                    const msg = `◊•─┄┅═══❁  🌺  ❁═══┅┄─•◊
○ ¦ تمت اضافة البوت بنجاح
○ ¦ الاسم ${botName}
○ ¦ البادئة ${prefix}
○ ¦ المجموعة ${threadInfo.threadName || "بدون اسم"}
○ ¦ الاعضاء ${threadInfo.participantIDs.length}
○ ¦ التاريخ ${currentTime}
╮─[ الأوامر ]─╭
│ ${prefix}اوامر – معلومات عن البوت
│ ${prefix}ميرور – دردشة مع ميرور
╯──────────────╰`;

                    const imagePath = path.join(__dirname, '..', '..', 'avatars', `${botID}.png`);
                    let attachment = null;
                    
                    if (fs.existsSync(imagePath)) {
                        attachment = fs.createReadStream(imagePath);
                    } else {
                        const avatarUrl = await getAvatarUrl(botID);
                        const response = await axios.get(avatarUrl, { responseType: 'stream' });
                        attachment = response.data;
                    }
                    
                    await api.sendMessage({ body: msg, attachment: attachment }, threadID);
                    return;
                }

                // إضافة أعضاء جدد
                const newMembers = logMessageData.addedParticipants.filter(p => p.userFbId !== botID);
                if (newMembers.length === 0) return;

                const threadInfo = await api.getThreadInfo(threadID);
                const groupName = threadInfo.threadName || "المجموعة";
                const memberCount = threadInfo.participantIDs.length;

                // حالة: عضو واحد - ترحيب فردي
                if (newMembers.length === 1) {
                    const member = newMembers[0];
                    
                    // الحصول على صورة العضو
                    let userAvatar = null;
                    try {
                        const avatarUrl = await getAvatarUrl(member.userFbId);
                        const response = await axios.get(avatarUrl, { responseType: 'stream' });
                        userAvatar = response.data;
                    } catch(e) {}

                    const textMsg = `╮─◦─◦─◦─◦─◦─◦─◦─◦─◦─◦─◦─╭
○ ¦ اهلا وسهلا بك
○ ¦ ${member.fullName}
○ ¦ في مجموعة ${groupName}
○ ¦ الاعضاء الان ${memberCount}
○ ¦ التاريخ ${currentTime}
╯─◦─◦─◦─◦─◦─◦─◦─◦─◦─◦─◦─╰`;

                    if (userAvatar) {
                        await api.sendMessage({ body: textMsg, attachment: userAvatar }, threadID);
                    } else {
                        await api.sendMessage(textMsg, threadID);
                    }
                    return;
                }

                // حالة: أكثر من عضو - ترحيب جماعي
                const memberNames = newMembers.map(m => m.fullName);
                let membersList = "";
                
                if (newMembers.length === 2) {
                    membersList = `${memberNames[0]} و ${memberNames[1]}`;
                } else {
                    const last = memberNames.pop();
                    membersList = `${memberNames.join("، ")} و ${last}`;
                }

                // الحصول على صورة المجموعة
                let groupImage = null;
                try {
                    const threadInfoFull = await api.getThreadInfo(threadID);
                    if (threadInfoFull.imageSrc) {
                        const response = await axios.get(threadInfoFull.imageSrc, { responseType: 'stream' });
                        groupImage = response.data;
                    }
                } catch(e) {}

                const textMsg = `╮─◦─◦─◦─◦─◦─◦─◦─◦─◦─◦─◦─╭
○ ¦ اهلا وسهلا بالاعضاء الجدد
○ ¦ ${membersList}
○ ¦ انضموا إلى ${groupName}
○ ¦ الاعضاء الان ${memberCount}
○ ¦ التاريخ ${currentTime}
╯─◦─◦─◦─◦─◦─◦─◦─◦─◦─◦─◦─╰`;

                if (groupImage) {
                    await api.sendMessage({ body: textMsg, attachment: groupImage }, threadID);
                } else {
                    await api.sendMessage(textMsg, threadID);
                }
                break;
            }

            case "log:unsubscribe": {
                if (logMessageData.leftParticipantFbId === botID) return;
                try {
                    const userInfo = await api.getUserInfo(logMessageData.leftParticipantFbId);
                    api.sendMessage(`وداعا ${userInfo[logMessageData.leftParticipantFbId].name}\nالتاريخ ${currentTime}`, threadID);
                } catch(e) {
                    api.sendMessage(`أحد الأعضاء غادر المجموعة.\nالتاريخ ${currentTime}`, threadID);
                }
                break;
            }

            
            
            case "log:thread-name": {
                try {
                    await api.changeNickname(`[ ${prefix} ] ◈ ${botName}`, threadID, botID);
                } catch(e) {}
                break;
            }
        }
    } catch (error) {
        console.error("خطأ:", error);
    }
};

module.exports.ZOTERun = async function({ api, event }) {
    api.sendMessage("هذا الأمر يعمل تلقائياً مع أحداث المجموعة.", event.threadID, event.messageID);
};