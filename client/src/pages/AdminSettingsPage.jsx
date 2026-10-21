import { useEffect, useRef, useState } from 'react';
import { useBeforeUnload, useBlocker, useNavigate } from 'react-router';
import { useAdminAuth } from '../app/useAdminAuth.js';
import ConfirmDialog from '../components/admin/ConfirmDialog.jsx';
import '../styles/admin-settings.css';

const emptySettings = {
  hotelName: '',
  primaryPhone: '',
  secondaryPhone: '',
  instagramUrl: '',
  address: '',
  googleMapsUrl: '',
};

function settingsToForm(settings) {
  const phoneNumbers = Array.isArray(settings.phoneNumbers) ? settings.phoneNumbers : [];
  return {
    hotelName: typeof settings.hotelName === 'string' ? settings.hotelName : '',
    primaryPhone: typeof phoneNumbers[0] === 'string' ? phoneNumbers[0] : '',
    secondaryPhone: typeof phoneNumbers[1] === 'string' ? phoneNumbers[1] : '',
    instagramUrl: typeof settings.instagramUrl === 'string' ? settings.instagramUrl : '',
    address: typeof settings.address === 'string' ? settings.address : '',
    googleMapsUrl: typeof settings.googleMapsUrl === 'string' ? settings.googleMapsUrl : '',
  };
}

function validIndianPhone(value) {
  const compact = value.trim().replace(/[\s()-]/g, '');
  const nationalNumber = compact.startsWith('+91') ? compact.slice(3) : compact;
  return /^[6-9]\d{9}$/.test(nationalNumber);
}

function validInstagramUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && ['www.instagram.com', 'instagram.com'].includes(url.hostname.toLowerCase())
      && !url.username && !url.password && !url.port
      && /^\/[A-Za-z0-9._-]{1,30}\/?$/.test(url.pathname);
  } catch {
    return false;
  }
}

function validMapsUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && ['www.google.com', 'google.com', 'maps.google.com'].includes(url.hostname.toLowerCase())
      && !url.username && !url.password && !url.port
      && /^\/maps\/place\/.+/.test(url.pathname);
  } catch {
    return false;
  }
}

function validate(values) {
  const errors = {};
  if (!values.hotelName.trim() || values.hotelName.trim().length > 120) errors.hotelName = 'Enter a hotel name of 1 to 120 characters.';
  if (!validIndianPhone(values.primaryPhone)) errors.primaryPhone = 'Enter a valid 10-digit Indian mobile number.';
  if (!validIndianPhone(values.secondaryPhone)) errors.secondaryPhone = 'Enter a valid 10-digit Indian mobile number.';
  if (!validInstagramUrl(values.instagramUrl.trim())) errors.instagramUrl = 'Use an HTTPS Instagram profile URL.';
  if (!values.address.trim() || values.address.trim().length > 500) errors.address = 'Enter an address of 1 to 500 characters.';
  if (!validMapsUrl(values.googleMapsUrl.trim())) errors.googleMapsUrl = 'Use an HTTPS Google Maps URL.';
  return errors;
}

export default function AdminSettingsPage() {
  const { request } = useAdminAuth();
  const navigate = useNavigate();
  const [baseline, setBaseline] = useState(null);
  const [values, setValues] = useState(emptySettings);
  const [revision, setRevision] = useState(0);
  const [errors, setErrors] = useState({});
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const submitting = useRef(false);
  const dirty = baseline !== null && JSON.stringify(values) !== JSON.stringify(baseline);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => (
    dirty && !saving && currentLocation.pathname !== nextLocation.pathname
  ));
  useBeforeUnload((event) => {
    if (dirty && !saving) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  useEffect(() => {
    const controller = new AbortController();
    request('/site-settings', { signal: controller.signal })
      .then(({ data: settings }) => {
        if (controller.signal.aborted) return;
        const formValues = settingsToForm(settings);
        setBaseline(formValues);
        setValues(formValues);
        setRevision(settings.revision);
        setErrors({});
        setSaveError('');
        setMessage('');
      })
      .catch((error) => {
        if (!controller.signal.aborted) setLoadError(error.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [request]);

  function update(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    setMessage('');
    setSaveError('');
  }

  function reset() {
    if (!baseline) return;
    setValues({ ...baseline });
    setErrors({});
    setMessage('');
    setSaveError('');
  }

  async function submit(event) {
    event.preventDefault();
    if (submitting.current || loading || !baseline) return;
    const fieldErrors = validate(values);
    setErrors(fieldErrors);
    setMessage('');
    setSaveError('');
    if (Object.keys(fieldErrors).length) {
      document.getElementById(`settings-${Object.keys(fieldErrors)[0]}`)?.focus();
      return;
    }
    submitting.current = true;
    setSaving(true);
    try {
      const saved = (await request('/site-settings', {
        method: 'PATCH',
        body: {
          hotelName: values.hotelName.trim(),
          phoneNumbers: [values.primaryPhone.trim(), values.secondaryPhone.trim()],
          instagramUrl: values.instagramUrl.trim(),
          address: values.address.trim(),
          googleMapsUrl: values.googleMapsUrl.trim(),
          revision,
        },
      })).data;
      const formValues = settingsToForm(saved);
      setBaseline(formValues);
      setValues(formValues);
      setRevision(saved.revision);
      setMessage('Website settings saved.');
    } catch (error) {
      setSaveError(error.status === 409
        ? `${error.message} Reload the latest settings before editing again.`
        : error.message);
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  }

  async function reloadLatest() {
    setLoading(true);
    setLoadError('');
    try {
      const { data: settings } = await request('/site-settings');
      const formValues = settingsToForm(settings);
      setBaseline(formValues);
      setValues(formValues);
      setRevision(settings.revision);
      setErrors({});
      setSaveError('');
      setMessage('');
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  }

  const field = (name) => ({
    id: `settings-${name}`,
    value: values[name],
    onChange: (event) => update(name, event.target.value),
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': errors[name] ? `settings-${name}-error` : undefined,
  });
  const fieldError = (name) => errors[name] && (
    <p className="admin-form-error" id={`settings-${name}-error`} role="alert">{errors[name]}</p>
  );

  return <>
    <p className="eyebrow">Administration</p>
    <h1 id="admin-settings-title">Website settings</h1>
    <p className="admin-dashboard-lede">Manage the hotel details shown to visitors. Changes take effect after you save.</p>
    {loading && <p className="admin-management-state" role="status">Loading current website settings…</p>}
    {!loading && loadError && <div className="admin-management-state" role="alert">
      <p>{loadError}</p>
      <button className="button button-outline mt-5" type="button" onClick={() => reloadLatest()}>Try again</button>
    </div>}
    {!loading && !loadError && <form className="admin-settings-form" onSubmit={submit} noValidate>
      <fieldset disabled={saving}>
        <legend className="sr-only">Public hotel information</legend>
        <label htmlFor="settings-hotelName">Hotel name</label>
        <input {...field('hotelName')} maxLength={120} autoComplete="organization" />
        {fieldError('hotelName')}

        <div className="admin-settings-columns">
          <div>
            <label htmlFor="settings-primaryPhone">Primary phone number</label>
            <input {...field('primaryPhone')} inputMode="tel" type="tel" maxLength={24} autoComplete="tel" />
            {fieldError('primaryPhone')}
          </div>
          <div>
            <label htmlFor="settings-secondaryPhone">Secondary phone number</label>
            <input {...field('secondaryPhone')} inputMode="tel" type="tel" maxLength={24} />
            {fieldError('secondaryPhone')}
          </div>
        </div>
        <p className="admin-field-hint">Use a 10-digit Indian mobile number. You may include the +91 country code.</p>

        <label htmlFor="settings-instagramUrl">Instagram profile URL</label>
        <input {...field('instagramUrl')} type="url" maxLength={2048} autoComplete="url" />
        {fieldError('instagramUrl')}

        <label htmlFor="settings-address">Hotel address</label>
        <textarea {...field('address')} rows={4} maxLength={500} autoComplete="street-address" />
        {fieldError('address')}

        <label htmlFor="settings-googleMapsUrl">Google Maps URL</label>
        <input {...field('googleMapsUrl')} type="url" maxLength={2048} autoComplete="url" />
        {fieldError('googleMapsUrl')}
        <p className="admin-field-hint">Use the hotel’s approved Google Maps listing link, not a generic search URL.</p>

        {message && <p className="admin-settings-success" role="status">{message}</p>}
        {saveError && <div className="admin-settings-error" role="alert">
          <p>{saveError}</p>
          {saveError.includes('Reload the latest settings') && <button type="button" className="button button-outline mt-4" onClick={() => reloadLatest()}>Reload latest settings</button>}
        </div>}
        <div className="admin-room-actions mt-6">
          <button className="button button-primary" type="submit" disabled={saving || !dirty}>{saving ? 'Saving…' : 'Save changes'}</button>
          <button className="button button-outline" type="button" disabled={saving || !dirty} onClick={reset}>Reset changes</button>
          <button className="button button-outline" type="button" disabled={saving} onClick={() => navigate('/admin')}>Cancel</button>
        </div>
      </fieldset>
    </form>}
    {blocker.state === 'blocked' && <ConfirmDialog title="Discard unsaved changes?" confirmLabel="Discard changes" onCancel={() => blocker.reset()} onConfirm={() => blocker.proceed()}>
      <p>Your website settings edits have not been saved. Choose Cancel to keep editing.</p>
    </ConfirmDialog>}
  </>;
}
