const fs = require('fs-extra');
const path = require('path');
const axios = require('axios');

module.exports.config = {
    title: "اوامر",
    release: "2.0.1",
    clearance: 0,
    author: "ZOTE Tracks",
    summary: "عرض قائمة الأوامر أو تفاصيل أمر معين",
    section: "عـــامـة",
    syntax: "اوامر [اسم الأمر]",
    delay: 5,
};

const IMAGE_URL = "https://i.postimg.cc/yd7qxTCL/monkey-d-luffy-3840x2160-26035.jpg";
const LOCAL_IMG_PATH = path.join(__dirname, "img", "menu.png");
const FALLBACK_IMG_PATH = path.join(__dirname, "cache", "menu.jpg");
const BOT_NAME = "Noxe Bot v6.7.1";
const DEVELOPER_NAME = "Ali hsan";

async function getImageStream() {
  
  if (fs.existsSync(LOCAL_IMG_PATH)) {
    return fs.createReadStream(LOCAL_IMG_PATH);
}

  
  fs.ensureDirSync(path.dirname(FALLBACK_IMG_PATH));
  if (!fs.existsSync(FALLBACK_IMG_PATH)) {
    try {
        const res = await axios.get(IMAGE_URL, { responseType: "arraybuffer"});
        fs.writeFileSync(FALLBACK_IMG_PATH, res.data);
    } catch (e) {
        console.error("Error downloading help image:", e);
        return null;
    }
}

  return fs.createReadStream(FALLBACK_IMG_PATH);
}



module.exports.ZOTERun = async function({ api, event, args }) {
  const { threadID } = event;
  const commandsMap = Zote.client.commands;

  const uniqueCommands = new Map();
  for (const [alias, cmd] of commandsMap.entries()) {
    if (cmd.config && cmd.config.title && !uniqueCommands.has(cmd.config.title)) {
      uniqueCommands.set(cmd.config.title, cmd);
    }
  }

  if (args.length === 0) {
    
    const grouped = {};
    for (const [title, cmd] of uniqueCommands.entries()) {  
      const cat = cmd.config.section || "بدون فئة";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(title);
    }

    
    let msg = ``;
    msg += `╮───────∙⋆⋅ ※ ⋅⋆∙───────╭\n`; 
    msg += `    قـــائــمــة الاوامـــــر\n`; 
    msg += `╯───────∙⋆⋅ ※ ⋅⋆∙───────╰\n\n`; 
    for (const [category, list] of Object.entries(grouped)) {
      
      msg += `╮────∙⋆⋅「 ${category} 」\n`;
      
      let commandLines = [];
      for (let i = 0; i < list.length; i += 3) {
        const chunk = list.slice(i, i + 3);
        
        commandLines.push("│ › " + chunk.join('  ›  '));
      }
      msg += commandLines.join('\n') + '\n';
      
      
      msg += `╯───────∙⋆⋅ ※ ⋅⋆∙───────◈\n\n`;
    }

    
    msg += `╮───────∙⋆⋅ ※ ⋅⋆∙───────◈\n`;
    msg += `│ الاوامــر : ${uniqueCommands.size}\n`;
    msg += `│ اســم الــبــوت : ${BOT_NAME}\n`;
    msg += `│ الــمــالــلك : ${DEVELOPER_NAME}\n`;
    msg += `│ اسـتـخــدم : اوامر [اسم الامر] `; 
    msg += `╯───────∙⋆⋅ ※ ⋅⋆∙───────◈\n`;

    const imageStream = await getImageStream();
    return api.sendMessage({ body: msg, attachment: imageStream }, threadID);
  }

  
  const commandName = args.join(" ").trim().toLowerCase();
  const command = uniqueCommands.get(commandName) || Array.from(uniqueCommands.values()).find(c => (c.config.title && c.config.title.toLowerCase() === commandName) || (c.config.aliases && c.config.aliases.includes(commandName)));

  if (!command) {
    return api.sendMessage(`❌ الأمر "${commandName}" غير موجود.`, threadID);
  }

  const permMap = { 0: "عضو", 1: "أدمن المجموعة", 2: "مطور البوت" };
  const { title, clearance, section, summary, syntax, delay } = command.config;

  const details = `╮────∙⋆⋅「 تفاصيل 」⋅⋆∙────╭
│
│  ◈ الاســم : ${title}
│  ◈ الصلاحية : ${permMap[clearance] || "غير محددة"}
│  ◈ الفئــة : ${section || "غير محددة"}
│
│  ◈ الوصــف : ${summary || "لا يوجد وصف"}
│  ◈ الاستخدام : ${syntax || title}
│
│  ◈ الـمـدة : ${delay || 5} ثوانٍ
│  ◈ المطــور : ${DEVELOPER_NAME}
│
╯───────∙⋆⋅ ※ ⋅⋆∙───────╰`;

  const imageStream = await getImageStream();
  return api.sendMessage({ body: details, attachment: imageStream }, threadID);
};
