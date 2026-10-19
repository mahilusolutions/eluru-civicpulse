import { useEffect, useState } from 'react';
import { getSettings, updateSetting } from '../api/settings';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import AlertBanner from '../components/ui/AlertBanner';
import LoadingBlock from '../components/ui/LoadingBlock';
import PageHeader from '../components/ui/PageHeader';
import Panel, { btnGhost, btnPrimary, Field, inputClass } from '../components/ui/Panel';

export default function SettingsPage() {
  const { roleLabel, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState('Eluru');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    getSettings()
      .then((data) => {
        setSettings(data);
        const workspace = data?.workspace;
        if (workspace?.city) setCity(String(workspace.city));
      })
      .catch((err) => setMsg(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function saveCity(e) {
    e.preventDefault();
    try {
      const next = {
        ...(settings?.workspace || {}),
        city,
        ac_code: settings?.workspace?.ac_code || 'S01-65',
        product: 'CivicPulse',
      };
      await updateSetting('workspace', next);
      setSettings((s) => ({ ...(s || {}), workspace: next }));
      setMsg('Saved.');
    } catch (err) {
      setMsg(err.message);
    }
  }

  if (loading) return <LoadingBlock label="Loading settings…" />;

  return (
    <section className="space-y-4">
      <PageHeader
        eyebrow="Account"
        title="Settings"
        description="Your role, theme, and campaign city."
      />
      <AlertBanner tone="info">{msg}</AlertBanner>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel className="p-4 sm:p-5">
          <p className="text-sm font-bold text-[var(--ink)]">Signed in</p>
          <p className="mt-2 text-lg font-bold">{roleLabel}</p>
          <button type="button" onClick={logout} className={`${btnGhost} mt-4`}>
            Sign out
          </button>
        </Panel>

        <Panel className="p-4 sm:p-5">
          <p className="text-sm font-bold text-[var(--ink)]">Theme</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Current: <span className="font-semibold text-[var(--ink)]">{theme}</span>
          </p>
          <button type="button" onClick={toggleTheme} className={`${btnPrimary} mt-4`}>
            Switch light / dark
          </button>
        </Panel>

        <Panel className="p-4 sm:p-5 lg:col-span-2">
          <p className="text-sm font-bold text-[var(--ink)]">Campaign city</p>
          <form onSubmit={saveCity} className="mt-3 flex flex-wrap gap-2">
            <Field label="City" className="min-w-[200px] flex-1">
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className={inputClass}
              />
            </Field>
            <div className="flex items-end">
              <button type="submit" className={btnPrimary}>
                Save
              </button>
            </div>
          </form>
        </Panel>
      </div>
    </section>
  );
}
