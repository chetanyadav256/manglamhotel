# Website settings management

The protected page `/admin/settings` edits the single `SiteSettings` document
with `singletonKey: "primary"`. Sign in through the existing admin session;
there is no separate settings login or public write endpoint.

## Editable fields and validation

- Hotel name: trimmed, 1–120 characters.
- Primary and secondary phone numbers: both required; each must be an Indian
  mobile number beginning 6–9 with ten national digits. The API accepts an
  optional `+91` prefix and spaces, parentheses or hyphens, then stores a canonical
  `+91 NNNNNNNNNN` form.
- Instagram: HTTPS URL on `instagram.com` or `www.instagram.com`, containing
  one profile name.
- Address: trimmed, 1–500 characters.
- Google Maps: HTTPS listing URL on an approved Google Maps hostname using a
  `/maps/place/` path. Generic search URLs are rejected.

The browser keeps edits local until **Save changes**. Reset restores the
currently loaded values. Unsaved edits prompt before in-app navigation and
before closing/reloading the document. Validation errors are shown beside
their fields.

## Protected API

Both endpoints require the existing active admin session and return
`Cache-Control: no-store`.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/admin/site-settings` | Returns the six public settings values and an internal `revision` for compare-and-set updates. |
| `PATCH /api/admin/site-settings` | Requires the complete editable allowlist plus the revision returned by GET; validates and atomically saves the values. |
| `GET /api/site-settings` | Existing public read-only endpoint; returns only hotel name, phones, Instagram URL, address and Maps URL. |

Mutations require the existing exact allowed Origin, same-site policy, JSON
content type and session-bound CSRF token. Unknown fields, MongoDB operators,
partial updates and invalid values receive HTTP 400. A successful update
increments `revision`; a stale revision receives HTTP 409 and does not overwrite
the newer document. Legacy singleton documents without a revision are treated
as revision zero on read and upgraded atomically on the first save. Updates
never upsert, so they cannot create a duplicate settings document. The
singleton key retains its unique index. The existing startup seeder remains
`$setOnInsert` and does not reset customized settings.

Database unavailability returns HTTP 503. Public settings never expose the
revision or provide a mutation endpoint. The client uses the confirmed
`client/src/config/contact.js` values only as a read fallback when the public
settings request is unavailable; fallback values are never submitted to the
admin API automatically.

## Automated checks

Run from the repository root:

```powershell
npm run check
npm run test:e2e
```

Settings API tests use the isolated Express/auth fixture with in-memory
persistence and Mongoose model validation. Browser tests intercept all API
requests and use an in-memory settings object. They do not connect to Atlas or
modify production settings.

## Manual verification

1. Start the local application and sign in with the existing authorized admin
   account. Open **Website Settings** from the dashboard.
2. Verify the displayed name, both confirmed phone numbers, Instagram URL,
   address and original Google Maps listing match the stored values.
3. Change a value only to owner-approved details. Use **Reset changes** before
   saving if you do not intend to update the live database.
4. Save an approved update and confirm the success status. Open the public
   website and check the Navbar location link, Contact page, home location
   section and Footer. Refresh the page and confirm the values persist.
5. Open the same settings form in two authorized sessions. Save from one
   session, then submit an older form from the other; it should receive a
   conflict message and offer **Reload latest settings** without replacing the
   first update.
6. Try malformed phone numbers, non-HTTPS URLs, unapproved hosts and a generic
   Google search URL; confirm field validation prevents submission. Verify
   Cancel/Reset and unsaved-navigation warnings.
7. Check the admin page at 360, 393, 768, 1024 and 1440 pixels. Avoid changing
   production settings solely for testing; automated tests use isolated data.
