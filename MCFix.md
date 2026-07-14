# MCFix — دليل حل مشاكل المصادقة (Clerk + Cloudflare)

## المشكلة

**الأعراض:** خطأ `401 Unauthorized` عند رفع الملفات أو أي طلب API يحتاج مصادقة.

**السبب الجذري:** عدم تطابق مفاتيح Clerk بين الفرونت إند والـ API Server — كل منهما يستخدم مفاتيح من instance مختلف.

---

## الحل الكامل (5 خطوات)

### 1. إعادة مزامنة مفاتيح Clerk

في CodeExecution (sandbox):

```javascript
const result = await setupClerkWhitelabelAuth();
console.log(JSON.stringify(result, null, 2));
```

يجب أن تظهر هذه المتغيرات في `envVarsSet`:
- `CLERK_SECRET_KEY`
- `CLERK_PUBLISHABLE_KEY`
- `VITE_CLERK_PUBLISHABLE_KEY`

---

### 2. رفع المفاتيح الجديدة لـ Cloudflare Worker

```bash
cd artifacts/cloudflare-app

printf '%s' "$CLERK_SECRET_KEY" | npx wrangler secret put CLERK_SECRET_KEY
printf '%s' "$CLERK_PUBLISHABLE_KEY" | npx wrangler secret put CLERK_PUBLISHABLE_KEY
```

**ملاحظة:** لا تستخدم `--non-interactive` — غير مدعوم في هذا الإصدار من wrangler.

---

### 3. بناء الفرونت إند ونشر Cloudflare

```bash
cd /home/runner/workspace
pnpm --filter @workspace/minecraft-hub run build
cd artifacts/cloudflare-app
npx wrangler deploy
```

---

### 4. إعادة تشغيل الـ workflows في Dev

بعد تغيير المفاتيح لا تنسَ إعادة تشغيل كلا الـ workflows:
- `artifacts/minecraft-hub: web`
- `artifacts/api-server: API Server`

---

### 5. تسجيل الخروج وإعادة الدخول ⚠️

**هذه الخطوة إلزامية.** الجلسة القديمة مرتبطة بالمفاتيح القديمة. بعد تحديث المفاتيح يجب:

1. فتح الموقع المنشور
2. تسجيل الخروج (Sign out)
3. إعادة تسجيل الدخول (Sign in)

بدون هذه الخطوة سيستمر الخطأ 401.

---

## لماذا يحدث هذا؟

```
Frontend Token  →  مُوقَّع بـ  pk_test_A
API Secret Key  →  يتحقق بـ  sk_test_B
النتيجة:        →  401 Unauthorized
```

عند استدعاء `setupClerkWhitelabelAuth()` يتم ربط الثلاثة بنفس الـ instance:

```
pk_test_A  ←→  sk_test_A  ✅
```

---

## البنية الحالية للمصادقة

### الفرونت إند (`App.tsx`)

```tsx
// يحقن Bearer token في كل طلب API تلقائياً
function ClerkTokenBridge() {
  const { getToken } = useAuth();
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
    return () => setAuthTokenGetter(null);
  }, [getToken]);
  return null;
}
```

### Dev Server (`@clerk/express`)

يقرأ `Authorization: Bearer <token>` عبر `clerkMiddleware` من Express.

### Cloudflare Worker (`@clerk/backend`)

يتحقق من الـ Bearer token عبر `verifyToken(token, { secretKey })`.

---

## تشخيص سريع

| الأعراض | الحل |
|---------|------|
| 401 على كل الطلبات | إعادة مزامنة المفاتيح (الخطوة 1) |
| 401 بعد نشر Cloudflare | رفع المفاتيح لـ Cloudflare (الخطوة 2) |
| 401 رغم صحة المفاتيح | تسجيل الخروج وإعادة الدخول (الخطوة 5) |
| الموقع المنشور لا يُحدَّث | إعادة البناء والنشر (الخطوة 3) |
| `getToken()` يُرجع null | المستخدم غير مسجّل دخول |

---

## ملاحظات مهمة

- **`pk_test_` مع Cloudflare:** مفاتيح الـ development تعمل على Cloudflare لكن بدون دعم الـ proxy (`VITE_CLERK_PROXY_URL` يكون فارغاً).
- **`wrangler secret put`:** يقرأ القيمة من stdin — استخدم `printf '%s' "$VAR"` وليس `echo` لتجنب newline.
- **secrets في الـ Shell:** أحياناً تظهر المتغيرات فارغة في ShellExec حتى لو موجودة. إذا أعاد `BAAS_API_KEY` فارغاً لا تفترض أنه غير موجود — استخدم `requestSecrets` أولاً.
