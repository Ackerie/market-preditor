# NexusTrade Google Play release packet

This packet prepares store text and identifies the Console declarations that
must be completed by the Play Console account owner. It is not legal advice or
a claim that Google Play has approved the app.

## Listing

- **App name:** NexusTrade
- **Category:** Finance
- **Short description:** Market data, analysis, broker connections, and trading controls for your own accounts.
- **Full description:**

  NexusTrade brings multi-market information and trading tools into one
  workspace. Review market data and charts, organize a watchlist, request
  AI-assisted analysis, and connect supported third-party brokerage accounts.

  You control whether to connect an account and whether to enable automated
  trading. When connected, orders may be sent to your broker account. Review
  every broker permission, order, and automation setting carefully. NexusTrade
  does not hold customer funds and is not a broker or investment adviser.

  Trading involves substantial risk, including loss of money. Market data and
  AI-generated analysis can be delayed, incomplete, or inaccurate. Nothing in
  the app is investment advice or a guarantee of results. Features and
  instrument availability depend on your broker, provider, and jurisdiction.

- **Support email:** `trivisionja@gmail.com`
- **Privacy policy:** <https://market-predictor-eight.vercel.app/privacy>
- **Account deletion instructions:** <https://market-predictor-eight.vercel.app/delete-account>
- **Feature graphic:** `artifacts/crypto-trader/store-assets/feature-graphic-1024x500.png`
- **512 × 512 app icon:** `artifacts/crypto-trader/store-assets/icon-512.png`

The feature graphic is a designed illustration, not a screenshot or a promise
of trading performance. Capture at least two genuine phone screenshots from a
tested release build and upload them in Play Console; do not use mock screens
as product screenshots.

## Data safety worksheet

Confirm these declarations against the exact release build and the current
Google Play Console questionnaire:

- **Personal information:** email address and optional first/last name for
  account creation, sign-in, account support, and requested email alerts.
- **Financial information:** broker connection credentials/API tokens users
  choose to provide, and account/position/order context requested from their
  chosen broker to provide portfolio and trading features.
- **App activity:** settings, watchlists, analysis requests, and trading or
  automation activity needed to provide and secure the account features.
- **Credentials:** password-derived hashes, session tokens, broker credentials,
  and optional AI-provider API keys. Broker and AI-provider credentials are
  encrypted before server storage; Android session tokens use Android secure
  storage.
- **Sharing:** disclose transmission to the broker and AI provider selected by
  the user to fulfill their requested actions; the hosting, database, market
  data, content-delivery, and email service providers needed to operate the
  service. AI prompts may contain relevant market/account context, but not
  broker credentials or the user's AI API key. The website loads fonts from
  Google.
- **Security:** app/API traffic uses HTTPS; account deletion can be initiated
  in the app and from the public deletion page.
- **Advertising:** the app does not currently show ads or use advertising
  trackers. Do not select this answer without rechecking the submitted build.

The Console may categorize the broker/API credentials and trading history
differently. Answer its actual questions, including whether each data type is
required or optional, collected, shared, and processed ephemerally. Do not
claim that data is not shared simply because a provider is used to fulfill a
user request.

## Financial features and review access

In the Financial features declaration, accurately disclose that NexusTrade
supports analysis and orders for accounts held at third-party brokers,
including automated orders when enabled. The app does not itself custody funds
or provide a broker account. This description does not establish that the app
is exempt from licensing or other legal requirements. Google Play may request
evidence that the app and its operator are authorized to provide financial
services in the regions where it is distributed. Resolve that question with
qualified counsel and the relevant regulators before publishing.

Provide reviewer instructions that let Google reach the app without using
real-money broker credentials. If a review account is required, create a
dedicated test account and ensure it cannot place live trades. Never put
production passwords, broker keys, AI keys, or signing secrets in this
repository or public listing.

## Before submitting

1. Deploy the API account-deletion endpoint to Railway and verify deletion in
   the production database with a disposable test account.
2. Deploy the website and verify both public policy URLs work without login.
3. Use a JDK 21 installation and Android SDK/Android Studio to build and test
   the Android app on a physical device. Test login, secure session storage,
   logout, account deletion, broker linking, and all trading controls. Test
   without real broker credentials first.
4. Create an upload keystore outside the repository. Set the four
   `ANDROID_UPLOAD_*` environment variables documented in `DEVELOPMENT.md`,
   then build the signed AAB. Enable Play App Signing in Play Console and keep
   a protected backup of the upload key.
5. Increment `versionCode` in `artifacts/crypto-trader/android/app/build.gradle`
   for each Play release.
6. In Play Console, complete app access, target audience/content rating,
   financial features, Data safety, privacy policy, developer contact, and
   any regional declarations. Upload genuine phone screenshots, the feature
   graphic, and the 512 × 512 icon.
7. Check Play Console's current target API requirement, app signing status,
   country availability, and review warnings. Start with a closed test track
   and only promote after the tester and policy checks pass.

The app is prepared for this release workflow but is **not submission-ready**
until the above checks, legal eligibility review, deployed policy/deletion
URLs, real-device QA, and Play Console account declarations are complete.
