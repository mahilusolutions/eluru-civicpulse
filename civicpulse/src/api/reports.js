import client, { unwrap } from './client';

export function getReport(type) {
  return client.get(`/reports/${type}`).then(unwrap);
}

export function downloadReportCsv(type) {
  return getReport(type).then((data) => {
    const blob = new Blob(['﻿', data.csv || ''],{ type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `civicpulse-${type}-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    return data;
  });
}

export function getReportsSummary() {
  return client.get('/reports').then(unwrap);
}
