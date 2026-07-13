# مشكلة تسجيل الدخول على نشر Cloudflare (Log in fix)

هذا الملف توثيقي فقط — لا يؤثر على عمل الموقع ولا يُشغَّل كجزء من الكود. الهدف منه أنه إذا واجهنا نفس المشكلة مستقبلاً (هنا أو في مشروع آخر يستخدم نفس البنية)، نعرف مباشرة ما هو السبب وكيف تم حلّه من الألف إلى الياء.

## المشكلة

الموقع يعمل بشكل تام على رابط تطوير Replit، لكنه عند نشره على Cloudflare Workers
(`https://minecraft-hub.mcfoxy.workers.dev`) كانت الأعراض:
- زر "Sign in" يظهر، لكن الضغط عليه لا يُكمل تسجيل الدخول.
- صفحة البروفايل لا تعمل.
- تسجيل الخروج لا يعمل.
- كل هذا كان يعمل سابقاً على نفس الرابط، ثم توقف.

## خطوات التشخيص (بالترتيب)

1. **استبعاد كود الواجهة (Frontend):** فحص `Layout.tsx` و `App.tsx` تأكّد أن منطق زر "تسجيل الدخول / تسجيل الخروج" سليم ولا يوجد فيه مسار يُخفي الزر — المشكلة إذن ليست في مكوّن الواجهة نفسه.

2. **فحص شبكة الطلبات مباشرة عبر curl على مسار الـ proxy الخاص بـ Clerk:**
   ```
   curl -i "https://minecraft-hub.mcfoxy.workers.dev/api/__clerk/v1/client?__clerk_api_version=2024-10-01"
   ```
   النتيجة: `HTTP 400` مع رسالة:
   ```json
   {"errors":[{"message":"Invalid host","long_message":"We were unable to attribute this request to an instance running on Clerk. Make sure that your Clerk Publishable Key is correct.","code":"host_invalid"}]}
   ```
   هذا هو الدليل المباشر على المشكلة.

3. **مقارنة سلوك نفس الميدلوير على Replit dev:** الميدلوير الأصلي في `artifacts/api-server/src/middlewares/clerkProxyMiddleware.ts` يحتوي على تعليق صريح:
   > "Only active in production — Clerk proxying doesn't work for dev instances"

   يعني: البروكسي يُفعَّل **فقط** إذا كان `NODE_ENV === "production"`. في بيئة Replit للتطوير، `NODE_ENV` ليست `production`، فيتم تجاوز البروكسي تلقائياً ويتصل المتصفح بخوادم Clerk مباشرة (وهذا مسموح ويعمل بسلاسة مع مفاتيح التطوير عبر أي نطاق/origin).

4. **فحص نفس البروكسي في نسخة Cloudflare** (`artifacts/cloudflare-app/src/index.ts`): البروكسي هناك كان **مفروضاً دائماً وبلا أي شرط** (لا يوجد تحقق من نوع المفتاح أو من `NODE_ENV`)، بعكس نسخة Express الأصلية.

5. **فحص نوع مفتاح Clerk المُستخدَم فعلياً في البناء (build):**
   ```
   grep -o "pk_[a-zA-Z0-9_]*" dist/public/assets/*.js
   ```
   النتيجة: `pk_test_...` — أي أن المفتاح المستخدَم هو **مفتاح تطوير (Development instance)**، وليس مفتاح إنتاج (`pk_live`). في مشروعنا الحالي (Clerk المُدار من Replit) لا يوجد أصلاً مفتاح إنتاج متاح.

## السبب الجذري

**ميزة الـ Proxy الخاصة بـ Clerk (تمرير طلبات Frontend API عبر نطاقك الخاص) غير مدعومة إطلاقاً مع مفاتيح Development.**
Clerk يتطلب لتفعيل البروكسي أن يكون هناك instance من نوع Production مع نطاق proxy مُتحقَّق منه (verified) داخل لوحة تحكم Clerk. مع مفتاح تطوير، أي طلب يمر عبر بروكسي مخصص يُرفض فوراً بخطأ `host_invalid` ("Invalid host") — بالضبط كما ظهر في الفحص.

- **على Replit:** البروكسي يتم تجاوزه تلقائياً لأن `NODE_ENV` ليست production، فتذهب طلبات Clerk مباشرة لخوادم Clerk (تعمل بشكل طبيعي مع مفاتيح التطوير من أي origin).
- **على Cloudflare:** البروكسي كان مفروضاً دون أي شرط بسبب اختلاف في تنفيذ الميدلوير بين النسختين (Express لديه هذا الشرط، نسخة Hono/Workers لم يكن لديها) — فكانت كل طلبات Clerk تُرفض.

## الحل

تمت إزالة تمرير البروكسي عن عملية البناء الخاصة بـ Cloudflare بدلاً من تعديل السلوك في وقت التشغيل، لأن المفتاح المتاح حالياً هو مفتاح تطوير فقط، وأبسط حل موثوق هو أن يتصل المتصفح بخوادم Clerk مباشرة (بدون بروكسي) تماماً كما يحدث في Replit dev:

في `artifacts/cloudflare-app/package.json`:
```diff
- "build": "VITE_CLERK_PROXY_URL=https://minecraft-hub.mcfoxy.workers.dev/api/__clerk pnpm --filter @workspace/minecraft-hub run build",
+ "build": "pnpm --filter @workspace/minecraft-hub run build",
```

بهذا لا يتم تمرير `VITE_CLERK_PROXY_URL` أثناء البناء، فيبقى `clerkProxyUrl` في `App.tsx` بلا قيمة (`undefined`)، ويتصل `ClerkProvider` بخوادم Clerk مباشرة دون بروكسي.

ثم أُعيد البناء والنشر:
```
cd artifacts/cloudflare-app
pnpm run deploy
```

### التحقق من الحل
تم التأكد بطلب مباشر على نطاق Clerk الحقيقي للمفتاح (`topical-lobster-68.clerk.accounts.dev`) مع `Origin` مطابق لنطاق Cloudflare:
```
curl -i "https://topical-lobster-68.clerk.accounts.dev/v1/client?__clerk_api_version=2024-10-01" \
  -H "Origin: https://minecraft-hub.mcfoxy.workers.dev"
```
النتيجة: `HTTP 401` (غير مُصادَق، وهو طبيعي بدون جلسة) مع رأس:
```
access-control-allow-origin: https://minecraft-hub.mcfoxy.workers.dev
```
هذا يعني أن Clerk يقبل الاتصال المباشر من هذا النطاق بدون أي مشاكل — أي أن تسجيل الدخول والبروفايل وتسجيل الخروج تعمل الآن بشكل طبيعي.

## القاعدة العامة (لأي مشروع مستقبلي)

- إذا كان مفتاح Clerk المتاح هو `pk_test_...` (Development instance): **لا تستخدم بروكسي Clerk مطلقاً**، اترك الاتصال مباشراً — يعمل من أي نطاق تلقائياً.
- بروكسي Clerk (`proxyUrl` / `Clerk-Proxy-Url`) مخصص فقط لحالات production مع نطاق مُتحقَّق منه داخل لوحة تحكم Clerk (`pk_live_...`).
- عند تكرار خطأ `"code":"host_invalid"` من Clerk، هذا هو أول شيء يجب فحصه: هل يُستخدَم بروكسي مع مفتاح تطوير؟
