/** The Data page: one upload box, full details on View, and files that are already uploaded are skipped. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

global.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../api/data', () => ({
  getRollFiles: jest.fn(),
  getRollFile: jest.fn(),
  retryRollFile: jest.fn(),
  uploadRollPdf: jest.fn(),
}));

const dataApi = require('../api/data');
const DataPage = require('./DataPage').default;

const TEL = (n) => `2025-EROLLGEN-S01-65-FinalRoll-Revision1-TEL-${n}.pdf`;
const ENG = (n) => `2026-EROLLGEN-S01-65-SIR-DraftRoll-Revision1-ENG-${n}-WI.pdf`;
const readyFile = (n, voters = 1380) => ({ id: String(n), filename: TEL(n), part_no: n, parse_status: 'ready', voter_count: voters, page_count: 60, duration_ms: 1058000, extracted_at: '2026-10-23T00:14:49Z' });

let host;
let root;

async function mount(files) {
  dataApi.getRollFiles.mockResolvedValue(files);
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <DataPage />
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

const text = () => document.body.textContent;
const click = async (el) => act(async () => el.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const buttonWith = (t) => [...document.body.querySelectorAll('button')].find((b) => b.textContent.includes(t));
const choose = async (files) =>
  act(async () => {
    const input = document.body.querySelector('input[type="file"]');
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
const pdf = (name) => new File(['%PDF-1.4'], name, { type: 'application/pdf' });

test('there is one upload box and no spreadsheet option', async () => {
  await mount([readyFile(1)]);
  expect(document.body.querySelectorAll('input[type="file"]').length).toBe(1);
  expect(text()).not.toMatch(/spreadsheet/i);
  expect(text()).toContain('Drop voter list PDFs here');
});

test('View shows everything about the upload', async () => {
  dataApi.getRollFile.mockResolvedValue({
    ...readyFile(1),
    language: 'Telugu',
    size_bytes: 19853679,
    uploaded_at: '2026-10-22T17:24:59Z',
    processed_at: '2026-10-23T00:14:49Z',
    stats: { voters: 1380, male: 700, female: 676, with_epic: 1370, with_age: 1360, with_house: 1375, with_phone: 406, households: 462, roads: 12, pages_with_voters: 58, avg_age: 47.3, first_serial: 1, last_serial: 1384 },
    roll: { assembly: '65 - ELURU (GEN)', publication_date: '06-01-2025' },
    booth: { pollingStationName: 'Z.P. High School', pollingStationAddress: 'Sanivarapupeta, Eluru', areaName: 'Part 1' },
    document: { durationMs: 1058000 },
  });
  await mount([readyFile(1)]);
  await click(buttonWith('View'));
  expect(dataApi.getRollFile).toHaveBeenCalledWith('1');
  const t = text();
  expect(t).toContain(TEL(1));
  expect(t).toContain('Telugu');
  expect(t).toContain('18.9 MB');
  expect(t).toContain('1,380');
  expect(t).toContain('Voter ID read');
  expect(t).toContain('99%');
  expect(t).toContain('Phone numbers saved');
  expect(t).toContain('Z.P. High School');
  expect(t).toContain('65 - ELURU (GEN)');
  expect(t).toContain('See the 1,380 voters');
});

test('files that are already uploaded are skipped and never sent', async () => {
  dataApi.uploadRollPdf.mockResolvedValue({ part_no: 6 });
  await mount([readyFile(5)]);
  await choose([pdf(TEL(5)), pdf(ENG(5)), pdf(TEL(6)), pdf(TEL(6))]);
  expect(dataApi.uploadRollPdf).toHaveBeenCalledTimes(1);
  expect(dataApi.uploadRollPdf.mock.calls[0][0].name).toBe(TEL(6));
  const t = text();
  expect(t).toContain('Already uploaded');
  expect(t).toContain('Booth 5 is already uploaded');
  expect(t).toContain('Same file chosen twice');
  expect(t).toContain('1 uploaded');
  expect(t).toContain('skipped');
});

test('if the server says it is already there (409) the row is skipped, not failed', async () => {
  const err = Object.assign(new Error('Booth 9 is already uploaded as x.pdf (being read now).'), { status: 409 });
  dataApi.uploadRollPdf.mockRejectedValue(err);
  await mount([]);
  await choose([pdf(TEL(9))]);
  expect(text()).toContain('Skipped');
  expect(text()).not.toContain('failed');
});
