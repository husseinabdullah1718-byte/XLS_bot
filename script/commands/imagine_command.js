const axios = require("axios");
const fs = require("fs-extra");


let isProcessing = false;
const cooldowns = new Map();

module.exports.config = {
    title: "تخيلي",
    release: "1.2.0",
    clearance: 0,
    author: "ZOTE Tracks",
    summary: "رسم صورة من نص باستخدام الذكاء الاصطناعي باستخدام نماذج متعددة.",
    section: "زكـــــــاء",
    syntax: "تخيل [النص] | [رقم الموديل (1-3)]\nمثال: تخيل قط يرتدي قبعة ساحر | 1",
    delay: 30,
};

module.exports.ZOTERun = async ({ api, event, args }) => {
  const { threadID, messageID, senderID } = event;

  
  const now = Date.now();
  const userCooldown = cooldowns.get(senderID) || 0;
  const COOLDOWN_TIME = 30 * 1000; 

  if (now < userCooldown) {
    const remainingTime = Math.ceil((userCooldown - now) / 1000);
    return api.sendMessage(
      `⏳ يرجى الانتظار ${remainingTime} ثانية قبل استخدام الأمر مرة أخرى.`, 
      threadID,
      messageID
    );
  }

  
  if (isProcessing) {
    
    return api.setMessageReaction("⏳", messageID, threadID, (err) => {}, true);
  }

  
  isProcessing = true;

  const fullPrompt = args.join(" ");
  const parts = fullPrompt.split("|").map(s => s.trim());

  let textPrompt = parts[0];
  let modelNumber = 1; 

  if (parts.length > 1) {
    const parsedModelNumber = parseInt(parts[1]);
    if (!isNaN(parsedModelNumber) && parsedModelNumber >= 1 && parsedModelNumber <= 3) {
      modelNumber = parsedModelNumber;
    } else {
      isProcessing = false;
      return api.sendMessage(
        "❌ رقم الموديل غير صالح. يرجى استخدام 1 أو 2 أو 3.\nمثال: تخيل قط يرتدي قبعة ساحر | 1",
        threadID,
        messageID
      );
    }
  }

  if (!textPrompt) {
    isProcessing = false;
    return api.sendMessage(
      "❌ يرجى كتابة وصف للصورة التي تريد إنشائها وتحديد رقم الموديل.\nمثال: تخيل قط يرتدي قبعة ساحر | 1",
      threadID,
      messageID
    );
  }

  
  let modelName;
  switch (modelNumber) {
    case 1:
      modelName = "flux-2-dev";
      break;
    case 2:
      modelName = "zimage";
      break;
    case 3:
      modelName = "gptimage";
      break;
    default:
      modelName = "flux-2-dev"; 
  }

  
  const waitMessage = await api.sendMessage("⏳ جارٍ إنشاء صورتك باستخدام الموديل " + modelName + "، يرجى الانتظار...", threadID);

  try {
    
    const translationResponse = await axios.get(
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(textPrompt)}`
    );
    const translatedPrompt = translationResponse.data[0][0][0];

    
    const cachePath = __dirname + "/cache";
    fs.ensureDirSync(cachePath);
    const imagePath = cachePath + "/magic_image.png";

    
    const apiUrl = `https://gen.pollinations.ai/image/${encodeURIComponent(translatedPrompt)}?model=${modelName}&key=pk_uwZDxEZzn4IcgYWF`;
    
    
    const response = await axios.get(apiUrl, { responseType: "arraybuffer" });

    
    fs.writeFileSync(imagePath, Buffer.from(response.data, "binary"));

    
    api.sendMessage(
      {
        body: `✨ تفضل، هذه هي الصورة التي تخيلتها باستخدام الموديل **${modelName}**:\n\n- الوصف: "${textPrompt}"`, 
        attachment: fs.createReadStream(imagePath),
      },
      threadID,
      () => {
        
        fs.unlinkSync(imagePath);
        
        api.unsendMessage(waitMessage.messageID);
        
        cooldowns.set(senderID, now + COOLDOWN_TIME);
        
        isProcessing = false;
      },
      messageID
    );
  } catch (error) {
    console.error("خطأ في أمر تخيل:", error);
    
    api.unsendMessage(waitMessage.messageID);
    api.sendMessage("❌ حدث خطأ أثناء إنشاء الصورة. قد يكون هناك ضغط على الخادم، حاول مرة أخرى بعد قليل.", threadID, messageID);
    
    cooldowns.set(senderID, now + COOLDOWN_TIME);
    isProcessing = false;
  }
};
