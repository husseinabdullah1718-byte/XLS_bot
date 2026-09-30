# Dockerfile — بيئة تشغيل بوت Zote-Bot على Render
# ---------------------------------------------------------------
# لماذا Docker أصلاً؟ بيئة Render الأصلية لـ Node.js لا تبني حزمة
# canvas بشكل موثوق دائمًا. هذا الملف يبني بيئة كاملة يتحكم بها
# المشروع نفسه بدل الاعتماد على ما توفره المنصة تلقائيًا.
#
# ملاحظة: أزلنا كل إعدادات yt-dlp/بايثون/ffmpeg/curl_cffi اللي كانت
# هنا سابقًا لتجربة تحميل يوتيوب — تبيّن إن يوتيوب يحجب سيرفرات Render
# بغض النظر عن الإعداد، فما كان لها داعي تبقى وتزيد وقت البناء وحجم
# الصورة بلا فايدة. الحاوية الآن لا تنزّل أي شيء إضافي وقت التشغيل.

FROM node:18-bookworm-slim

# مكتبات النظام مطلوبة فقط لتجميع حزمة canvas (لرسم الصور/الشهادات)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential pkg-config \
    libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# نسخ ملفات package أولاً فقط (يسرّع عمليات النشر اللاحقة عبر Docker
# layer caching — إعادة تثبيت الحزم فقط لو package.json تغيّر فعلاً)
COPY package*.json ./
RUN npm install --omit=dev

# نسخ بقية المشروع
COPY . .

EXPOSE 10000

# لو استخدمت خاصية Render "Secret Files" لـ config.json وappstate.json
# (موصى به بدل رفعها بالمستودع)، فهي تصل وقت التشغيل فقط إلى /etc/secrets/
# وليس إلى مسار المشروع مباشرة — الأسطر التالية تنسخها لمكانها المتوقع.
# لو لم تستخدم هذه الخاصية (والملفات موجودة بالمستودع كالمعتاد)، الأمر
# يتجاهل النسخ بصمت ويكمل عاديًا. لا يوجد أي تنزيل آخر وقت التشغيل.
CMD ["/bin/sh", "-c", "cp -f /etc/secrets/config.json ./config.json 2>/dev/null; cp -f /etc/secrets/appstate.json ./appstate.json 2>/dev/null; mkdir -p ./session/cookies; cp -f /etc/secrets/youtube.txt ./session/cookies/youtube.txt 2>/dev/null; exec node start.js"]
