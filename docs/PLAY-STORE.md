# Publishing the Android app on Google Play

One Android app, **Gadget Galli** (`in.gadgetgalli.app`), serves customers and shop owners. This guide takes it from this repo to the Play Store. Do the steps in order; each one says who does it. **You** means the founder (accounts, payments, Google forms). **Claude** means a coding session with access to this repo.

Allow about 3 weeks for the whole process. New personal Play accounts must run a 14-day closed test before the app can go public, and the SMS (DLT) approval in [SETUP.md](SETUP.md) step 2 takes 1–2 weeks too. Start both now; they run in parallel.

## What is ready in the repo

- The app: Expo SDK 57 (React Native 0.86), targeting Android 16 (API 36), which meets Play's current target-API rule.
- Build profiles in `apps/mobile/eas.json`:
  - `preview`: an APK to install directly on shop owners' phones, with the demo logins.
  - `beta`: the Play Store bundle (AAB) for closed testing, with the demo logins, so testers and Google's reviewers can log in before real SMS works.
  - `production`: the bundle for the public release, with the demo logins off.
- Public pages Google asks for. They need no login and are in English, Telugu and Hindi:
  - Privacy policy: `https://darkslategray-dugong-202922.hostingersite.com/privacy`
  - Account deletion: `https://darkslategray-dugong-202922.hostingersite.com/delete-account`
  - Terms of use: `https://darkslategray-dugong-202922.hostingersite.com/terms`

  Use your own domain instead once it is connected.
- Store graphics in `store/play/`: the 512 × 512 icon, the 1024 × 500 feature graphic and phone screenshots (1080 × 1920).
- The permissions: location (only when the customer taps "Use my current location"), camera and photos (shop, product, review and packing photos), and notifications. No background location, no microphone, no SMS reading. No foreground service that needs a Play declaration.

## 1. Expo account: lets Claude build the app (You, 5 minutes)

1. Sign up free at [expo.dev](https://expo.dev).
2. **Account settings → Access tokens → Create token**, name it `claude`, and copy it.
3. In the Claude Code environment settings (the environment menu at the top of the session, then **Edit**):
   - Add the token as an environment variable or secret named **`EXPO_TOKEN`**. Paste it there, never into the chat.
   - Under **Network access**, add **`expo.dev`** and **`api.expo.dev`** to the allowed domains.
4. Start a new session (it picks up the new settings) and ask: *"Build the Gadget Galli Android app: the preview APK and the beta bundle."* Claude then:
   - links the project (`eas init`);
   - builds both;
   - gives you the APK download link for shops;
   - leaves the AAB ready for step 4.

Prefer to build on your own computer? Install Node.js 20+, then in `apps/mobile` run `npx eas-cli login` and `npx eas-cli build -p android --profile preview` (or `--profile beta`).

Expo keeps the app's signing key safe on its servers. Don't create your own keystore, and never delete the Expo project: every Play update must be signed with the same key.

## 2. Firebase: push notifications on Android (You, 10 minutes)

Without this the app works, but phones get no push notifications. That means no loud new-order alarm for shops while the phone is locked.

1. [console.firebase.google.com](https://console.firebase.google.com) → **Add project** `gadget-galli` (Analytics not needed).
2. **Add app → Android**, package name **`in.gadgetgalli.app`**. Download **`google-services.json`**. You can skip the SDK steps.
3. On [expo.dev](https://expo.dev) → your project → **Environment variables** → **Add**:
   - name **`GOOGLE_SERVICES_JSON`**;
   - type **File**, then upload the file;
   - visibility **Secret**;
   - environments: all.
4. Firebase → **Project settings → Service accounts → Generate new private key** (a JSON file).
5. expo.dev → project → **Credentials → Android → FCM V1 service account key → Upload** that JSON.
6. Tell Claude when it's done. Claude deploys the `send-push` function to Supabase and connects it (SETUP.md step 3). The next build then delivers push notifications.

## 3. Google Play Console account (You)

1. Sign up at [play.google.com/console](https://play.google.com/console): **US$25 one time**.
   - A **personal** account is quickest to open, but before going public Google requires a **closed test with at least 12 testers for 14 days in a row**.
   - An **organisation** account skips that test but needs a D-U-N-S number for the business (free, can take 2–4 weeks).
2. Verify your identity and phone number as Google asks.

## 4. Create the app and the closed test (You, about 1 hour)

**Create app:**
- App name: `Gadget Galli - Hyderabad Shops`.
- Default language: English (India) – en-IN.
- App or game: App. Free or paid: Free.
- Accept the declarations.

**Store listing** (Grow → Store presence → Main store listing):
- Use the texts below and the files in `store/play/`: the icon (`icon-512.png`), the feature graphic (`feature-graphic.png`), and 4–8 phone screenshots from `store/play/screenshots/`.
- Add translations for Telugu (te-IN) and Hindi (hi-IN) with the texts below. They help in local search.
- Category: **Shopping**. Contact email: `venuikkada@gmail.com`. Website: your customer website.

**App content** (Policy → App content). The answers are in the "Google forms" section below:
- Privacy policy URL: `https://darkslategray-dugong-202922.hostingersite.com/privacy`.
- App access: the demo logins.
- Ads: none.
- Content rating questionnaire.
- Target audience: 18 and over.
- Data safety.
- Account deletion URL: `https://darkslategray-dugong-202922.hostingersite.com/delete-account`.
- Government app: no. Financial features: none.

**Closed testing** (Test and release → Testing → Closed testing → Create track):
1. Upload the **beta** AAB from step 1.
2. Under **Testers**, add an email list of at least 12 people with Google accounts: partner shop owners, friends, family.
3. Send them the opt-in link. Each must join and keep the app installed.
4. After 14 days, apply for production access (Dashboard). Google asks a few questions about the test.

## 5. Going public (You + Claude, when the SMS login works)

The public release must not show demo logins or fictional shops. Before production:

1. SMS login works (SETUP.md step 2): a real number receives the OTP.
2. The live database has your real shops, not the demo data.
3. **Authentication → Phone → Test phone numbers** in Supabase has one reviewer number, e.g. `919000000001=123456`, so Google's reviewers can still log in.
4. Claude builds the **production** bundle (demo logins off) with your real support phone number set.
5. You upload it to **Production**, update the App access instructions to the reviewer number, and send it for review.

Updates later: Claude builds a new bundle (`autoIncrement` raises the version code), and you upload it to the same track.

---

## Store listing texts

### English (en-IN)

**App name (30):** Gadget Galli - Hyderabad Shops

**Short description (80):** Phones, laptops, CCTV and PC parts from Hyderabad shops, delivered in hours.

**Full description:**

```
Need a phone, laptop, graphics card or CCTV kit today? Gadget Galli shows you which Hyderabad shops have it in stock right now, at what price, and how fast they can deliver it to your door.

WHY CUSTOMERS LOVE IT
• Search the exact item: "iphone 15 128gb", "rtx 4060", "hikvision 2mp kit". Typos are fine.
• Compare real local shops by price, distance, rating and delivery time.
• Order in one tap: call or WhatsApp the shop directly.
• Delivered in hours across Hyderabad, by Porter, Rapido, Uber or the shop's own rider. Or pick it up from the shop.
• Pay on delivery, or pay a verified shop by UPI in the app.
• Gadget Galli protection: every paid order has a send-by time and a 4-digit delivery code. Give the code only when the product is in your hands. Late orders alert our team, and shops that don't deliver must refund you.
• Real reviews: only customers who received an order can rate a shop.
• English, Telugu and Hindi. Light and dark mode.

FOR SHOP OWNERS
• List your shop free and reach customers all over Hyderabad.
• Add products in seconds from our catalog, or upload your whole stock list.
• A loud new-order alarm, so you never miss a customer.
• Customers pay you directly. Small commission only on delivered orders.
• Insights: what people near you search for that you don't stock yet.
• A shop QR poster for your counter and a link to share on WhatsApp.

Gadget Galli is made in Hyderabad, for Hyderabad's electronics shops: Kukatpally, Ameerpet, Hitech City, Secunderabad, Abids, Dilsukhnagar and more.
```

### Telugu (te-IN)

**Short description:** హైదరాబాద్ షాపుల నుండి ఫోన్లు, ల్యాప్టాప్లు, CCTV, PC పార్ట్స్ గంటల్లో డెలివరీ.

**Full description:**

```
ఈ రోజే ఫోన్, ల్యాప్టాప్, గ్రాఫిక్స్ కార్డ్ లేదా CCTV కిట్ కావాలా? హైదరాబాదులో ఏ షాపుల్లో అది ఇప్పుడు స్టాక్లో ఉందో, ఏ ధరకో, మీ ఇంటికి ఎంత త్వరగా డెలివరీ చేయగలరో Gadget Galli చూపిస్తుంది.

కస్టమర్లకు ఎందుకు నచ్చుతుంది
• కావలసిన ఐటమ్నే వెతకండి: "iphone 15 128gb", "rtx 4060", "hikvision 2mp kit". స్పెల్లింగ్ తప్పులైనా పర్వాలేదు.
• లోకల్ షాపులను ధర, దూరం, రేటింగ్, డెలివరీ టైమ్తో పోల్చండి.
• ఒక్క ట్యాప్లో ఆర్డర్: షాపుకు నేరుగా కాల్ లేదా WhatsApp చేయండి.
• హైదరాబాద్ అంతటా గంటల్లో డెలివరీ, లేదా షాప్ నుండి పికప్.
• డెలివరీ అప్పుడు చెల్లించండి, లేదా వెరిఫై అయిన షాపుకు యాప్లో UPI ద్వారా చెల్లించండి.
• Gadget Galli రక్షణ: చెల్లించిన ప్రతి ఆర్డర్కు పంపాల్సిన సమయం, 4 అంకెల డెలివరీ కోడ్ ఉంటాయి. ప్రొడక్ట్ మీ చేతికి వచ్చాకే కోడ్ ఇవ్వండి.
• నిజమైన రివ్యూలు: ఆర్డర్ అందుకున్న కస్టమర్లు మాత్రమే రేటింగ్ ఇవ్వగలరు.
• ఇంగ్లీష్, తెలుగు, హిందీ.

షాప్ ఓనర్ల కోసం
• మీ షాపును ఉచితంగా లిస్ట్ చేసి హైదరాబాద్ అంతటా కస్టమర్లను చేరుకోండి.
• కొత్త ఆర్డర్ వస్తే గట్టిగా మోగే అలారం.
• కస్టమర్లు మీకే నేరుగా చెల్లిస్తారు. డెలివరీ అయిన ఆర్డర్లపై మాత్రమే చిన్న కమీషన్.
```

### Hindi (hi-IN)

**Short description:** हैदराबाद की दुकानों से फ़ोन, लैपटॉप, CCTV और PC पार्ट्स, घंटों में डिलीवरी।

**Full description:**

```
आज ही फ़ोन, लैपटॉप, ग्राफ़िक्स कार्ड या CCTV किट चाहिए? Gadget Galli दिखाता है कि हैदराबाद की किन दुकानों में यह अभी स्टॉक में है, किस कीमत पर, और वे कितनी जल्दी आपके घर तक पहुँचा सकती हैं।

ग्राहकों को क्यों पसंद है
• सही आइटम खोजें: "iphone 15 128gb", "rtx 4060", "hikvision 2mp kit"। स्पेलिंग की गलती चलेगी।
• लोकल दुकानों की कीमत, दूरी, रेटिंग और डिलीवरी टाइम की तुलना करें।
• एक टैप में ऑर्डर: दुकान को सीधे कॉल या WhatsApp करें।
• पूरे हैदराबाद में घंटों में डिलीवरी, या दुकान से पिकअप।
• डिलीवरी पर पेमेंट करें, या वेरिफ़ाइड दुकान को ऐप में UPI से पेमेंट करें।
• Gadget Galli सुरक्षा: हर पेमेंट हुए ऑर्डर का भेजने का समय और 4 अंकों का डिलीवरी कोड होता है। प्रोडक्ट हाथ में आने पर ही कोड दें।
• असली रिव्यू: सिर्फ़ ऑर्डर पाने वाले ग्राहक ही रेटिंग दे सकते हैं।
• अंग्रेज़ी, तेलुगु और हिंदी।

दुकान मालिकों के लिए
• अपनी दुकान मुफ़्त में लिस्ट करें और पूरे हैदराबाद के ग्राहकों तक पहुँचें।
• नया ऑर्डर आने पर ज़ोर से बजने वाला अलार्म।
• ग्राहक सीधे आपको पेमेंट करते हैं। सिर्फ़ डिलीवर हुए ऑर्डर पर छोटा कमीशन।
```

---

## Google forms: suggested answers

Check each answer against how you actually run the business. They are not legal advice.

**App access:** "All or some functionality is restricted", with these instructions:

> Log in with phone number 90000 00001 and code 123456 (customer). To see the shop owner side, log out and use 90000 10002 with code 123456. The login screen lists the demo numbers.

**Ads:** No, the app contains no ads.

**Content rating (IARC)**, category "All other app types":
- Violence, sexuality, bad language, drugs and gambling: **No**.
- Users can interact or exchange content: **Yes** (reviews with photos, shop replies).
- Shares the user's location with other users: **Yes** (the shop sees the delivery pin).
- Digital purchases: **No**.

**Target audience:** 18 and over only. The app does not target children.

**Data safety:**
- Collects data: **Yes**. Encrypted in transit: **Yes**. Users can ask for deletion: **Yes** (in the app and at the account deletion URL).
- Shared with third parties: **No**. An order goes to the shop the customer chose, at the customer's request, and companies that process data for Gadget Galli (Supabase, MSG91, Expo/Firebase) are service providers. Google does not count either as sharing.
- Data collected; none of it is used for ads:

| Data type | Required? | Why |
|---|---|---|
| Name | Required | App functionality, account management |
| Phone number | Required | App functionality, account management, fraud prevention |
| Address | Optional | App functionality (delivery) |
| Approximate and precise location | Optional | App functionality (shops near you, delivery pin) |
| Purchase history (orders) | Required to order | App functionality |
| Other financial info (UPI reference; shop owners' UPI and bank details) | Optional | App functionality |
| Photos | Optional | App functionality (reviews, shop and product photos) |
| In-app search history | Optional | App functionality, analytics (aggregated "Demand near you" for shops) |
| Device or other IDs (push token) | Optional | App functionality (notifications) |

**Financial features:** "My app doesn't provide any financial features." Payments happen in the customer's own UPI app, directly to the shop.

**Foreground service permissions:** none are declared, so there's nothing to fill in.
