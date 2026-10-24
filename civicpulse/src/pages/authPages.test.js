/**
 * Render checks for the sign-in and access-request screens: they must open, validate, and walk the main paths
 * without crashing. The server calls are replaced with fakes.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../api/auth', () => ({
  getMe: jest.fn(),
  signIn: jest.fn(),
  signOut: jest.fn(),
  changePassword: jest.fn(),
}));
jest.mock('../api/access', () => ({
  submitAccessRequest: jest.fn(),
  checkRequestStatus: jest.fn(),
  downloadAcknowledgement: jest.fn(),
  collectCredentials: jest.fn(),
  getRequestSummary: jest.fn(),
  listAccessRequests: jest.fn(),
  approveRequest: jest.fn(),
  rejectRequest: jest.fn(),
  listUsers: jest.fn(),
  updateUser: jest.fn(),
  resetUserPassword: jest.fn(),
  revokeUserSessions: jest.fn(),
}));
jest.mock('../utils/download', () => ({ saveBlob: jest.fn(), savePdfBase64: jest.fn() }));

const authApi = require('../api/auth');
const accessApi = require('../api/access');
const { AuthProvider } = require('../auth/AuthContext');
const { ThemeProvider } = require('../theme/ThemeContext');
const RequestAccessPage = require('./RequestAccessPage').default;
const RequestStatusPage = require('./RequestStatusPage').default;
const ChangePasswordPage = require('./ChangePasswordPage').default;
const SignInPage = require('./SignInPage').default;
const AccessPage = require('./AccessPage').default;

let host;
let root;

async function mount(element, route = '/') {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[route]}>
        <ThemeProvider>
          <AuthProvider>{element}</AuthProvider>
        </ThemeProvider>
      </MemoryRouter>
    );
  });
}

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  if (host) host.remove();
  root = null;
  host = null;
  jest.clearAllMocks();
});

const setValue = (el, value) => {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
};
const type = async (selector, value) => act(async () => setValue(document.body.querySelector(selector), value));
const click = async (el) => act(async () => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const buttonWith = (text) => [...document.body.querySelectorAll('button')].find((b) => b.textContent.includes(text));
const text = () => document.body.textContent;

describe('sign in', () => {
  test('shows the form and the two public links', async () => {
    authApi.getMe.mockRejectedValue(new Error('no session'));
    await mount(<SignInPage />);
    expect(text()).toContain('Sign in to CivicPulse');
    expect(document.body.querySelector('#signin-username')).not.toBeNull();
    expect(text()).toContain('Request access');
    expect(text()).toContain('Check request status');
  });

  test('a wrong password shows the server message and clears the password', async () => {
    authApi.getMe.mockRejectedValue(new Error('no session'));
    authApi.signIn.mockRejectedValue(new Error('Wrong username or password.'));
    await mount(<SignInPage />);
    await type('#signin-username', 'ravit.2345');
    await type('#signin-password', 'nope-nope');
    await act(async () => document.body.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(authApi.signIn).toHaveBeenCalledWith('ravit.2345', 'nope-nope');
    expect(text()).toContain('Wrong username or password.');
    expect(document.body.querySelector('#signin-password').value).toBe('');
  });
});

describe('request access', () => {
  test('empty form is refused with messages', async () => {
    await mount(<RequestAccessPage />);
    await act(async () => document.body.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(accessApi.submitAccessRequest).not.toHaveBeenCalled();
    expect(text()).toContain('Enter your full name');
    expect(text()).toContain('Enter a valid 10-digit mobile number');
    expect(text()).toContain('Please confirm the declaration');
  });

  test('a complete form is sent and the reference number is shown with the PDF button', async () => {
    accessApi.submitAccessRequest.mockResolvedValue({ reference: 'CPR-7K3M-9QX2', submitted_at: new Date().toISOString() });
    accessApi.downloadAcknowledgement.mockResolvedValue(new Blob(['%PDF']));
    await mount(<RequestAccessPage />);
    await type('#full_name', 'Ravi Kumar');
    await type('#mobile', '98480 12345');
    await type('#designation', 'Booth agent');
    await type('#area', 'Booth 14, Sanivarapu Peta');
    await type('#reason', 'To update voter details for booth 14.');
    await click(document.body.querySelector('input[type="checkbox"]'));
    await act(async () => document.body.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(accessApi.submitAccessRequest).toHaveBeenCalledTimes(1);
    expect(accessApi.submitAccessRequest.mock.calls[0][0]).toMatchObject({ full_name: 'Ravi Kumar', requested_role: 'booth_agent', consent: true });
    expect(text()).toContain('CPR-7K3M-9QX2');
    const pdf = buttonWith('Download acknowledgement');
    expect(pdf).toBeTruthy();
    await click(pdf);
    expect(accessApi.downloadAcknowledgement).toHaveBeenCalledWith('CPR-7K3M-9QX2', '98480 12345');
  });
});

describe('request status', () => {
  const approved = {
    reference: 'CPR-7K3M-9QX2', status: 'approved', submitted_at: new Date().toISOString(), decided_at: new Date().toISOString(), full_name: 'Ravi Kumar', mobile: '9848012345',
    designation: 'Booth agent', area: 'Booth 14', requested_role_label: 'Booth Agent', reason: 'Updating voters', note: 'Welcome.',
    account: { username: 'ravik.2345', role: 'booth_agent', role_label: 'Booth Agent', credentials_available: true },
  };

  test('approved: the login is shown only after confirming, with copy and PDF', async () => {
    accessApi.checkRequestStatus.mockResolvedValue(approved);
    accessApi.collectCredentials.mockResolvedValue({ username: 'ravik.2345', password: 'Kx7m-Q4pR-9tWn', pdf_base64: 'JVBERi0=', file_name: 'x.pdf' });
    await mount(<RequestStatusPage />, '/request-status?ref=cpr-7k3m-9qx2');
    expect(document.body.querySelector('#ref').value).toBe('CPR-7K3M-9QX2');
    await type('#mob', '98480 12345');
    await act(async () => document.body.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(text()).toContain('Approved');
    expect(text()).toContain('ravik.2345');
    expect(text()).not.toContain('Kx7m-Q4pR-9tWn');
    await click(buttonWith('Show my login details'));
    expect(text()).toContain('Show the password now?');
    await click(buttonWith('Yes, show my login details'));
    expect(accessApi.collectCredentials).toHaveBeenCalledTimes(1);
    expect(text()).toContain('Kx7m-Q4pR-9tWn');
    expect(text()).toContain('Shown only once');
    expect(buttonWith('Download login details')).toBeTruthy();
  });

  test('rejected: the reason is shown and there is no login', async () => {
    accessApi.checkRequestStatus.mockResolvedValue({ ...approved, status: 'rejected', note: 'Not matched to a booth team.', account: null });
    await mount(<RequestStatusPage />);
    await type('#ref', 'CPR-7K3M-9QX2');
    await type('#mob', '9848012345');
    await act(async () => document.body.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(text()).toContain('not approved');
    expect(text()).toContain('Not matched to a booth team.');
    expect(buttonWith('Show my login details')).toBeUndefined();
  });

  test('a wrong mobile shows the server error and stays on the form', async () => {
    accessApi.checkRequestStatus.mockRejectedValue(new Error('We could not find a request that matches these details.'));
    await mount(<RequestStatusPage />);
    await type('#ref', 'CPR-7K3M-9QX2');
    await type('#mob', '9000000000');
    await act(async () => document.body.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(text()).toContain('could not find a request');
    expect(document.body.querySelector('#ref')).not.toBeNull();
  });
});

describe('change password', () => {
  test('forced change: checklist updates and the form calls the server', async () => {
    authApi.getMe.mockResolvedValue({ user: { id: '1', username: 'ravik.2345', full_name: 'Ravi Kumar', role: 'booth_agent', role_label: 'Booth Agent', must_change_password: true } });
    authApi.changePassword.mockResolvedValue({ user: { id: '1', username: 'ravik.2345', full_name: 'Ravi Kumar', role: 'booth_agent', role_label: 'Booth Agent', must_change_password: false } });
    await mount(<ChangePasswordPage />, '/change-password');
    expect(text()).toContain('Choose your own password');
    await type('#cur', 'Kx7m-Q4pR-9tWn');
    await type('#new', 'Field-Agent-2026!');
    await type('#again', 'Field-Agent-2026!');
    expect(text()).toContain('Strong');
    await act(async () => document.body.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(authApi.changePassword).toHaveBeenCalledWith('Kx7m-Q4pR-9tWn', 'Field-Agent-2026!');
  });

  test('mismatching passwords are not sent', async () => {
    authApi.getMe.mockResolvedValue({ user: { id: '1', username: 'ravik.2345', full_name: 'Ravi', role: 'viewer', role_label: 'Viewer', must_change_password: true } });
    await mount(<ChangePasswordPage />, '/change-password');
    await type('#cur', 'Kx7m-Q4pR-9tWn');
    await type('#new', 'Field-Agent-2026!');
    await type('#again', 'Field-Agent-2027!');
    await act(async () => document.body.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(authApi.changePassword).not.toHaveBeenCalled();
    expect(text()).toContain('meet every point');
  });
});

describe('Super Admin: new requests', () => {
  const row = {
    id: '7', reference: 'CPR-7K3M-9QX2', full_name: 'Ravi Kumar', mobile: '9848012345', email: null, designation: 'Booth agent', area: 'Booth 14',
    requested_role: 'booth_agent', voter_id: null, reason: 'Updating voters for booth 14', referred_by: 'Ramesh', status: 'pending', admin_note: null, created_at: new Date().toISOString(),
  };

  test('lists the request with Accept and Reject, and Accept asks for the role', async () => {
    authApi.getMe.mockResolvedValue({ user: { id: '1', username: 'root', full_name: 'Root', role: 'super_admin', role_label: 'Super Admin', must_change_password: false } });
    accessApi.listAccessRequests.mockResolvedValue([row]);
    accessApi.approveRequest.mockResolvedValue({ username: 'ravik.2345', role: 'coordinator', role_label: 'Coordinator', reference: row.reference });
    await mount(<AccessPage />, '/app/access');
    expect(text()).toContain('Ravi Kumar');
    expect(text()).toContain('CPR-7K3M-9QX2');
    const accept = buttonWith('Accept');
    expect(accept).toBeTruthy();
    expect(buttonWith('Reject')).toBeTruthy();
    await click(accept);
    expect(text()).toContain('Accept and create account');
    await type('#role', 'coordinator');
    await click(buttonWith('Create account'));
    expect(accessApi.approveRequest).toHaveBeenCalledWith('7', 'coordinator', '');
    expect(text()).toContain('ravik.2345');
    expect(text()).toContain('You do not see it');
  });

  test('reject needs a reason first', async () => {
    authApi.getMe.mockResolvedValue({ user: { id: '1', username: 'root', full_name: 'Root', role: 'super_admin', role_label: 'Super Admin', must_change_password: false } });
    accessApi.listAccessRequests.mockResolvedValue([row]);
    accessApi.rejectRequest.mockResolvedValue({ reference: row.reference });
    await mount(<AccessPage />, '/app/access');
    await click(buttonWith('Reject'));
    const confirm = buttonWith('Reject request');
    expect(confirm.disabled).toBe(true);
    await type('#why', 'Could not match you to a booth team.');
    expect(buttonWith('Reject request').disabled).toBe(false);
    await click(buttonWith('Reject request'));
    expect(accessApi.rejectRequest).toHaveBeenCalledWith('7', 'Could not match you to a booth team.');
  });
});
