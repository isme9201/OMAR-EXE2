# دليل بناء Avenmedia لنظام macOS

هذا الدليل مخصص للمشروع الحالي **Avenmedia / OMAR-EXE2** ويشرح بناء ملفات DMG لكل من Apple Silicon وIntel من جهاز Mac محلي. لا يمكن إنشاء تطبيق macOS قابل للتشغيل من Linux؛ يلزم تنفيذ أوامر بناء Mac على macOS مع أدوات Apple.

## المتطلبات على جهاز Mac

1. ثبّت Node.js 22 أو إصدار LTS متوافقاً.
2. ثبّت pnpm 9. إذا كان Corepack متوفراً:

   ```bash
   corepack enable
   corepack prepare pnpm@9 --activate
   ```

   أو ثبّت pnpm مباشرة:

   ```bash
   npm install --global pnpm@9
   ```

3. ثبّت أدوات Xcode. لبناء تطبيق سطح مكتب فقط يكفي عادةً تثبيت Command Line Tools:

   ```bash
   xcode-select --install
   ```

   وافتح تطبيق Terminal بعد إكمال التثبيت. إذا كان Xcode مثبتاً بالكامل، افتحه مرة واحدة ليكمل إعداد مكوناته.
4. ثبّت Rust عبر rustup إن لم يكن مثبتاً، ثم أعد فتح Terminal:

   ```bash
   curl --proto '=https' --tlsv1.2 https://sh.rustup.rs -sSf | sh
   ```

## تجهيز المشروع

فكّ ضغط ملف المشروع وافتح Terminal داخل مجلد `OMAR-EXE2` الذي يحتوي `package.json`، ثم نفّذ:

```bash
pnpm install --frozen-lockfile
pnpm build
```

الأمر `pnpm build` ينشئ مجلد `out/` الذي يستخدمه غلاف Tauri. يضم المشروع إعداد Supabase العام الخاص به افتراضياً، لذلك لا يلزم ملف `.env.local` للبناء العادي. لا تضع مفتاح Supabase من نوع `service_role` أو أسرار Cloudinary في ملف يضمّن مع التطبيق. إذا أردت استخدام مشروع Supabase آخر، يمكن ضبط `NEXT_PUBLIC_SUPABASE_URL` و`NEXT_PUBLIC_SUPABASE_ANON_KEY` في `.env.local` قبل `pnpm build`.

## بناء نسخة Apple Silicon

```bash
rustup target add aarch64-apple-darwin
APPLE_SIGNING_IDENTITY="-" pnpm tauri build --target aarch64-apple-darwin --bundles dmg
```

ستجد ملف DMG ضمن:

```text
src-tauri/target/aarch64-apple-darwin/release/bundle/dmg/
```

## بناء نسخة Intel

```bash
rustup target add x86_64-apple-darwin
APPLE_SIGNING_IDENTITY="-" pnpm tauri build --target x86_64-apple-darwin --bundles dmg
```

ستجد ملف DMG ضمن:

```text
src-tauri/target/x86_64-apple-darwin/release/bundle/dmg/
```

يمكن تنفيذ بناء المعماريتين من جهاز Mac واحد؛ لا يلزم امتلاك جهاز Intel منفصل. على جهاز Apple Silicon، قد تحتاج Rosetta لتشغيل النسخة المخصصة لـ Intel بغرض الاختبار.

## خيار إضافي: DMG واحد Universal

إذا رغبت بملف واحد يحتوي كوداً أصلياً للمعماريتين، ثبّت الهدفين ثم نفّذ:

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
APPLE_SIGNING_IDENTITY="-" pnpm tauri build --target universal-apple-darwin --bundles dmg
```

سيكون الناتج تحت:

```text
src-tauri/target/universal-apple-darwin/release/bundle/dmg/
```

للتحقق من معمارية الملف التنفيذي في بناء Universal:

```bash
lipo -archs src-tauri/target/universal-apple-darwin/release/photomedia-erp
```

المتوقع أن تظهر `arm64` و`x86_64`.

## التوقيع والتوزيع

استخدام `APPLE_SIGNING_IDENTITY="-"` ينشئ توقيعاً محلياً من نوع **ad-hoc** ولا يحتاج إلى شهادة توزيع. هذا مناسب للتجربة والبناء المحلي، لكنه ليس توقيع Developer ID ولا ينجز توثيق Apple (notarization). لذلك قد يطلب macOS السماح بفتح التطبيق من **إعدادات النظام ← الخصوصية والأمان** عند تشغيله أول مرة، خصوصاً إذا نُقل ملف DMG أو التطبيق من جهاز آخر.

لتوزيع التطبيق على مستخدمين آخرين دون تحذير التحقق المعتاد، تحتاج شهادة **Developer ID Application** وتوثيق التطبيق لدى Apple؛ إعداد ذلك غير مطلوب لإنتاج ملفات البناء المحلية أعلاه.

## فتح التطبيق أو تجربته

افتح ملف DMG الناتج، واسحب `Avenmedia.app` إلى مجلد `Applications`. إذا ظهرت رسالة منع عند أول تشغيل لنسخة ad-hoc، راجع **إعدادات النظام ← الخصوصية والأمان** واختر السماح بفتح التطبيق الذي أنشأته.

للتشغيل أثناء التطوير من مجلد المشروع، بعد تجهيز الاعتماديات:

```bash
pnpm tauri dev
```

## المراجع الرسمية

- [متطلبات Tauri](https://v2.tauri.app/start/prerequisites/)
- [حزمة macOS في Tauri](https://v2.tauri.app/distribute/macos-application-bundle/)
- [مرجع Tauri CLI — الهدف universal-apple-darwin](https://v2.tauri.app/reference/cli/)
- [توقيع macOS وAd-hoc لدى Tauri](https://v2.tauri.app/distribute/sign/macos/)
- [دليل Apple لبناء تطبيق Universal](https://developer.apple.com/documentation/apple-silicon/building-a-universal-macos-binary)
