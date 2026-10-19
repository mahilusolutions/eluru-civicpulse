import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, Moon, Sun } from 'lucide-react';
import { getSettings, updateSetting } from '../api/settings';
import { useAuth } from '../auth/AuthContext';
import { ROLES, getNavForRole } from '../auth/roles';
import AlertBanner from '../components/ui/AlertBanner';
import LoadingBlock from '../components/ui/LoadingBlock';
import PageHeader from '../components/ui/PageHeader';
import { Field, btnPrimary } from '../components/ui/Panel';
import { DetailRow, SectionTitle, btnTool, inputSm } from '../components/ui/kit';
import { useTheme } from '../theme/ThemeContext';

function Card({ title, children, className = '' }) {
  return (
    <section className={`rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-4 shadow-soft ${className}`}>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </section>
  );
}

export default function SettingsPage() {
  const { role, roleLabel, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const navigate = useNavigate();

  const canEdit = [ROLES.SUPER_ADMIN, ROLES.ADMIN].includes(role);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState('Eluru');
  const [msg, setMsg] = useState({ tone: 'info', text: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getSettings()
      .then((data) => {
        setSettings(data);
        if (data?.workspace?.city) setCity(String(data.workspace.city));
      })
      .catch((err) => setMsg({ tone: 'danger', text: err.message }))
      .finally(() => setLoading(false));
  }, []);

  async function saveCity(e) {
    e.preventDefault();
    setSaving(true);
    try {
      const next = { ...(settings?.workspace || {}), city: city.trim(), ac_code: settings?.workspace?.ac_code || 'S01-65', product: 'CivicPulse' };
      await updateSetting('workspace', next);
      setSettings((s) => ({ ...(s || {}), workspace: next }));
      setMsg({ tone: 'success', text: 'City saved.' });
    } catch (err) {
      setMsg({ tone: 'danger', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  function signOut() {
    logout();
    navigate('/');
  }

  if (loading) return <LoadingBlock label="Loading settings…" />;

  const screens = getNavForRole(role);

  return (
    <section className="w-full space-y-3">
      <PageHeader description="Your account, how the app looks, and the campaign workspace." />
      <AlertBanner tone={msg.tone}>{msg.text}</AlertBanner>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Card title="Signed in">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--brand)] text-base font-extrabold text-white" aria-hidden>
              {(roleLabel || 'U').slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-base font-extrabold text-[var(--ink)]">{roleLabel}</p>
              <p className="text-xs text-[var(--muted)]">Can use {screens.length} of the screens in the menu</p>
            </div>
          </div>
          <button type="button" onClick={signOut} className={`${btnTool} mt-4`}>
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </Card>

        <Card title="Appearance">
          <p className="mb-3 text-sm text-[var(--ink-soft)]">Dark mode is easier on the eyes in the evening.</p>
          <div className="inline-flex rounded-xl border border-[var(--line)] bg-[var(--bg)] p-0.5" role="group" aria-label="Colour theme">
            {[
              ['light', 'Light', Sun],
              ['dark', 'Dark', Moon],
            ].map(([id, label, ThemeIcon]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTheme(id)}
                aria-pressed={theme === id}
                className={`inline-flex items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-xs font-semibold transition ${theme === id ? 'bg-[var(--brand)] text-white shadow-sm' : 'text-[var(--ink-soft)] hover:text-[var(--brand)]'}`}
              >
                <ThemeIcon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </Card>

        <Card title="Workspace" className="md:col-span-2 xl:col-span-1">
          <form onSubmit={saveCity} className="space-y-3">
            <Field label="Campaign city">
              <input required disabled={!canEdit} value={city} maxLength={80} onChange={(e) => setCity(e.target.value)} className={inputSm} />
            </Field>
            {canEdit ? (
              <button type="submit" disabled={saving || !city.trim() || city.trim() === (settings?.workspace?.city || 'Eluru')} className={`${btnPrimary} !py-2`}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            ) : (
              <p className="text-xs text-[var(--muted)]">Only an admin can change the city.</p>
            )}
          </form>
          <dl className="mt-3">
            <DetailRow label="Constituency">{`${settings?.workspace?.city || 'Eluru'} (${settings?.workspace?.ac_code || 'S01-65'})`}</DetailRow>
            <DetailRow label="Product">CivicPulse by Mahilu Solutions</DetailRow>
          </dl>
        </Card>
      </div>
    </section>
  );
}
