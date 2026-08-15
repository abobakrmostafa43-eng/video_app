Termux Downloader Pro
Termux Downloader Pro هو مدير تنزيل وسائط محلي يعمل عبر واجهة ويب خفيفة وخادم Node.js، ويستخدم yt-dlp للتنزيل وffmpeg للدمج والتحويل عند الحاجة. صُمم ليعمل على الهاتف داخل Termux، مع بقاء الملفات والإعدادات على الجهاز.
استخدم التطبيق فقط مع المحتوى الذي تملك حق تنزيله أو تملك إذنًا صريحًا لاستخدامه، واحترم شروط الخدمات وحقوق النشر والخصوصية.
المتطلبات
يحتاج التطبيق إلى Node.js 20 أو أحدث، وffmpeg، وyt-dlp. على Termux يفضل تثبيت Termux من F-Droid أو من GitHub Releases، وعدم خلط مصادر Termux والإضافات بينها.
التثبيت على Termux
افتح Termux ونفذ الأوامر التالية:
pkg update -y && pkg upgrade -y
pkg install -y git nodejs-lts ffmpeg python
termux-setup-storage
بعد منح صلاحية التخزين، انسخ مجلد المشروع إلى الهاتف أو نزّله من مستودع Git:
cd ~
git clone <رابط-المستودع> termux-downloader-pro
cd termux-downloader-pro
إذا كان لديك ملف ZIP بدل مستودع:
pkg install -y unzip
mkdir -p ~/termux-downloader-pro
unzip /sdcard/Download/termux-downloader-pro.zip -d ~/termux-downloader-pro
cd ~/termux-downloader-pro
ثبّت حزم Node وابنِ النسخة الإنتاجية:
npm install
npm run check
npm run build
يجب أن يكون ملف yt-dlp التنفيذي في جذر المشروع. إذا لم يكن موجودًا، يمكن تثبيته بالطريقة التالية:
curl -L --fail --proto '=https' --tlsv1.2 \
  https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
  -o yt-dlp
chmod 700 yt-dlp
./yt-dlp --version
يفضل في الاستخدام الإنتاجي تثبيت إصدار معروف والتحقق من checksum الرسمي بدل الاعتماد على latest دون مراجعة.
التشغيل المحلي الآمن
التشغيل الافتراضي يستمع على 127.0.0.1 فقط، لذلك لا يكون التطبيق مكشوفًا لبقية أجهزة الشبكة:
npm start
افتح المتصفح على:
http://127.0.0.1:3000
للتشغيل التطويري:
npm run dev
تشغيل التطبيق من مجلد التخزين
يمكن اختيار مجلد تنزيل على مساحة الهاتف المشتركة:
mkdir -p /sdcard/TermuxDownloader
export DOWNLOAD_DIR=/sdcard/TermuxDownloader
npm start
لإعداد دائم، أنشئ ملف .env في جذر المشروع اعتمادًا على .env.example. لا تشارك هذا الملف إذا كان يحتوي على APP_TOKEN أو أي معلومات حساسة.
الوصول من جهاز آخر على الشبكة
لا تجعل الخادم عامًا دون حماية. أنشئ رمز وصول عشوائيًا:
export APP_TOKEN="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
export HOST=0.0.0.0
npm start
بعدها افتح http://IP-الهاتف:3000. سيطلب التطبيق الرمز عند أول دخول ويحفظه محليًا في المتصفح. إذا لم تضبط APP_TOKEN فلن يسمح الخادم عمدًا بالاستماع على عنوان غير محلي.
أوامر مفيدة
الأمر
الوظيفة
npm run dev
تشغيل تطويري مع Vite
npm run build
بناء الواجهة والخادم
npm start
تشغيل النسخة الإنتاجية
npm run check
فحص TypeScript
npm test
تشغيل اختبارات الحماية الأساسية
npm run clean
تنظيف ملفات البناء والملفات المؤقتة
أماكن البيانات
توجد الإعدادات وقائمة المهام داخل .data/، بينما توجد ملفات الوسائط داخل downloads/ افتراضيًا. ملف الكوكيز، عند استخدامه، يحفظ بصلاحيات خاصة داخل .data/cookies.txt ولا يعيده API إلى الواجهة. خذ نسخة احتياطية من ملفات الوسائط فقط، ولا ترفع .data/cookies.txt إلى Git أو أي خدمة عامة.
استكشاف الأعطال
إذا ظهر أن yt-dlp غير متاح، تحقق من التنفيذ عبر ./yt-dlp --version ومن صلاحياته. إذا فشل دمج الصوت والصورة أو استخراج MP3، تحقق من ffmpeg -version. إذا ظهرت صفحة حماية، راجع الرابط والكوكيز المصرح باستخدامها وتأكد من تحديث yt-dlp.
إذا لم يفتح التطبيق، تحقق من المنفذ:
curl http://127.0.0.1:3000/api/healthz
التحول إلى تطبيق Android مستقل لاحقًا
النسخة الحالية ليست APK؛ هي خادم محلي وواجهة ويب تعمل داخل Termux. لتحويلها إلى تطبيق Android مستقل توجد ثلاثة مسارات عملية:
المسار
المزايا
الملاحظات
WebView أو Trusted Web Activity
أسرع تحويل مع الحفاظ على الواجهة
يحتاج خدمة خلفية Android لإدارة yt-dlp وffmpeg
Capacitor
يعيد استخدام React ويتيح إضافة plugins
مناسب لتطبيق Android حقيقي مع طبقة native صغيرة
Kotlin/Jetpack Compose
أفضل تكامل مع الإشعارات والخدمات والتنزيلات
يحتاج إعادة بناء الواجهة والمنطق داخل Android
المسار الموصى به هو Capacitor + خدمة Android Foreground Service أو Kotlin إذا كان الهدف تطبيقًا تجاريًا طويل الأجل. يجب نقل مدير قائمة الانتظار إلى خدمة تعمل في الخلفية، استخدام WorkManager أو Foreground Service، حفظ المهام في Room/SQLite، طلب صلاحيات الإشعارات والتخزين وفق إصدار Android، ووضع yt-dlp وffmpeg أو بدائلهما داخل طبقة native مع مراعاة تراخيص التوزيع.
لا يكفي تغليف واجهة Termux داخل WebView؛ لأن Termux هو الذي يوفر حاليًا Node.js والعمليات التنفيذية. في النسخة المستقلة يجب أن يصبح تشغيل المحرك جزءًا من Android، مع إدارة الإيقاف والاستئناف والإشعارات وقيود البطارية. يمكن الإبقاء على نفس تصميم React ونفس عقود API في البداية، ثم استبدال طبقة الخادم المحلية بطبقة native تدريجيًا.
الترخيص والمراجعة قبل النشر
راجع تراخيص yt-dlp وffmpeg وأي build أو binary ستعيد توزيعه داخل APK. ثبّت الإصدارات في عملية البناء، خزّن checksums، وأنشئ CI يبني APK موقّعًا، مع اختبارات لمسارات الملفات والمصادقة وقائمة الانتظار. لا تنشر التطبيق على الإنترنت قبل تفعيل مصادقة وتشفير مناسبين ووضع سياسة خصوصية واضحة.
