# Google Calendar with adding and editing

**Just want to see a Google calendar?** You don't need any of this. Use its *Secret address in iCal format* as a
calendar link (see [configure.md](configure.md#finding-a-calendars-link)). That takes one minute and needs no Google key.

To **add and edit events** on Google calendars from the screen, OpenSky signs in to Google. Google requires every
MagicMirror screen to use **its own Google key**: a free "OAuth client" in your own Google Cloud project. That's
how every MagicMirror Google module works (for example MMM-GoogleCalendar). OpenSky guides you through it from the
phone setup page. It takes about 10 minutes, once.

## 1. Make your Google key (on a computer)
1. Open **<https://console.cloud.google.com>** and sign in with the Google account that has your calendars.
2. **Create a project.** Use the project picker at the top → *New project*, name it e.g. `OpenSky`, then *Create*.
   Make sure it's selected.
3. **Turn on the Calendar API.** Search the top bar for **Google Calendar API** → *Enable*.
4. **Set up the sign-in screen.** Menu → **Google Auth platform** → *Get started*.
   - App name: `OpenSky`; user support email: yours.
   - Audience: **External**.
   - Contact email: yours. Agree, then *Create*.
5. **Make it last.** Go to Google Auth platform → **Audience** → **Publish app** → *Confirm*. The status becomes
   **In production**.
   *If you skip this, Google keeps the app in "Testing" and the sign-in stops working after 7 days.*
6. **Create the key.** Go to Google Auth platform → **Clients** → **Create client**.
   - Application type: **Desktop app**; name: `OpenSky screen`.
   - Click *Create*.
   - **Copy the Client ID and the Client secret now.** Google shows the secret only once. You can also download the JSON.

You don't need to submit anything to Google for verification. The app is yours, used only by your family.

## 2. Connect it (on your phone)
1. On the screen: **Settings → Set up from your phone**. Scan the code and type the pairing code.
2. **Calendars → Add a calendar → Google.**
3. Paste the **Client ID** and **Client secret**, then tap **Get the Google sign-in** and **Sign in with Google**.
4. Google shows **"Google hasn't verified this app"**. That's expected for your own key. Tap **Advanced →
   Go to OpenSky (unsafe)**, then allow **both** permissions:
   - see your list of calendars
   - view and edit events
5. At the end your browser shows **a page that can't be reached**, with an address starting `http://127.0.0.1:53682/`.
   **That's expected.** Copy that whole address from the address bar, go back to the setup page, paste it, and tap
   **Finish sign-in**.
   - iPhone: tap the address bar, then tap and hold → *Copy*.
   - Android: tap the address bar, then *Copy*.
6. Pick which Google calendar to show, give it a name and a color, then tap **Add**, **Save** and **Finish**.

Add more Google calendars the same way. You're already signed in, so it goes straight to the calendar list.
Calendars you can only view (shared with you read-only) show their events but can't be changed from the screen.

## What OpenSky can do with it
- It sees the list of your calendars and views, adds, edits and deletes events. It asks for nothing else (no email,
  no contacts, no Drive).
- The sign-in is kept only on the Pi, in `config/secrets.json → google`. The phone and other devices never see it.
- Repeating events are shown, but are changed in Google Calendar itself.
- New events from Google appear within a few minutes (`fetchMinutes`, default 5). Changes made on the screen show at once.

## By hand (no phone)
`opensky.json`:
```json
"calendar": { "sources": [ { "name": "Family", "type": "google", "calendarId": "primary", "color": "blue" } ] }
```
`calendarId` is `"primary"` for your main calendar. For others, use the ID from Google Calendar → the calendar's
*Settings → Integrate calendar → Calendar ID*. Add `"readOnly": true` to show without editing. The sign-in itself
needs the phone page (or `secrets.json → google: { "clientId", "clientSecret", "refreshToken" }` if you have one).

## Problems
- **"The Google sign-in has expired"**: the app was still in *Testing* (7-day limit). Publish it (step 1.5), then
  sign in again from the phone.
- **"Google didn't accept the Client ID / secret"**: copy them again from Google Auth platform → Clients. If the
  secret is gone, add a new secret there.
- **"Access wasn't fully allowed"**: sign in again and tick both permissions.
- **"Google refused that"**: the Calendar API isn't enabled in that project (step 1.3).
- **To remove OpenSky's access:** <https://myaccount.google.com/permissions> → OpenSky → *Delete all connections*.
