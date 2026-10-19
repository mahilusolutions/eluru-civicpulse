/**
 * Parse ECI roll header / cover / section lines from OCR text.
 */

function cleanLine(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .replace(/[|{}]/g, '')
    .trim();
}

function parsePageMeta(pageText) {
  const text = String(pageText || '');
  const acMatch = text.match(
    /Assembly\s*Constituency\s*No\s*and\s*Name\s*:?\s*([^\n]+?)(?=\s*Part\s*Number|$)/i
  );
  const partMatch = text.match(/Part\s*Number\s*:?\s*(\d+)/i);
  const secMatch = text.match(
    /Section\s*No\s*and\s*Name\s*:?\s*(\d+)\s*[-–]\s*([^\n\r]+)/i
  );
  let section_name = secMatch ? cleanLine(secMatch[2]) : null;
  if (section_name) {
    section_name = section_name
      .replace(/\bName\s*:.*$/i, '')
      .replace(/\bPhoto\b.*$/i, '')
      .trim();
  }
  return {
    ac_name: acMatch ? cleanLine(acMatch[1]) : null,
    part_no: partMatch ? Number(partMatch[1]) : null,
    section_no: secMatch ? Number(secMatch[1]) : null,
    section_name: section_name || null,
  };
}

function extractSectionList(page1Text) {
  const text = String(page1Text || '');
  const start = text.search(/No\.?\s*and\s*name\s*of\s*sections/i);
  const end = text.search(/Polling\s*Station\s*Details|3\.\s*Polling/i);
  const chunk =
    start >= 0 ? text.slice(start, end > start ? end : start + 2500) : text.slice(0, 2500);
  const sections = [];
  const seen = new Set();
  const re = /(\d{1,3})\s*[-–]\s*([A-Za-z][A-Za-z0-9 .,'\/]{2,70})/g;
  let m;
  while ((m = re.exec(chunk))) {
    const no = Number(m[1]);
    let name = cleanLine(m[2])
      .replace(/\b(Tehsil|District|Pin|Post|Police|Subdivision)\b.*$/i, '')
      .trim();
    if (!name || name.length < 3 || no < 1 || no > 200) continue;
    if (seen.has(no)) continue;
    seen.add(no);
    sections.push({ section_no: no, section_name: name });
  }
  return sections;
}

function parseRollCover(pages) {
  const list = Array.isArray(pages) ? pages : [];
  const p1 = list.find((p) => Number(p.page ?? p.page_no ?? p.pageNo) === 1);
  const p2 = list.find((p) => Number(p.page ?? p.page_no ?? p.pageNo) === 2);
  const t1 = p1?.text || '';
  const t2 = p2?.text || '';

  const acMatch =
    t1.match(
      /No\.\s*Name\s*and\s*Reservation\s*Status\s*of\s*Assembly\s*Constituency\s*:?\s*([^\n]+)/i
    ) ||
    t1.match(/Assembly\s*Constituency[^:]*:\s*([^\n]+)/i) ||
    t2.match(/Assembly\s*Constituency\s*No\s*and\s*Name\s*:?\s*([^\n]+?)(?=\s*Part|$)/i);

  const partMatch =
    t1.match(/Part\s*Number\s*:?\s*(\d+)/i) || t2.match(/Part\s*Number\s*:?\s*(\d+)/i);

  const pollChunkStart = t1.search(/Polling\s*Station\s*Details/i);
  const pollChunk =
    pollChunkStart >= 0 ? t1.slice(pollChunkStart, pollChunkStart + 1200) : t1.slice(-1200);
  let polling_station = null;
  const psLine = pollChunk.match(
    /(\d+\s*[-–]\s*[A-Za-z][A-Za-z0-9 .,'\/]{3,60}(?:,\s*[A-Za-z][A-Za-z0-9 .,'\/]{2,40})?)/
  );
  if (psLine) {
    polling_station = cleanLine(psLine[1])
      .replace(/\bType\s*of\s*Polling.*$/i, '')
      .replace(/\bAddress\b.*$/i, '')
      .trim();
  }

  const addrMatch = pollChunk.match(
    /Address\s*of\s*Polling\s*Station\s*:?\s*([\s\S]*?)(?=\s*4\.|NUMBER\s*OF\s*ELECTORS|Signature|$)/i
  );
  let address = addrMatch
    ? cleanLine(
        addrMatch[1]
          .replace(/Number\s*of\s*Auxiliary[\s\S]*/i, '')
          .replace(/Stations?\s*in\s*this\s*part\s*:?/i, '')
      )
    : null;
  if (address && address.length > 400) address = address.slice(0, 400);

  const pinMatch = t1.match(/Pin\s*code\s*:?\s*(\d{6})/i);
  const qualMatch = t1.match(/Qualifying\s*Date\s*:?\s*([\d\-./]+)/i);
  const pubMatch =
    t1.match(/Date\s*of\s*Publication\s*:?\s*([\d\-./]+)/i) ||
    t2.match(/Date\s*of\s*Publication\s*[-:]?\s*([\d\-./]+)/i);
  const townMatch = t1.match(/Main\s*Town\s*or\s*Village\s*:?\s*([^\n]+)/i);
  const postMatch = t1.match(/Post\s*Office\s*:?\s*([^\n]+)/i);
  const tehsilMatch = t1.match(/Tehsil\s*:?\s*([^\n]+)/i);
  const districtMatch = t1.match(/District\s*[-:]?\s*([^\n]+)/i);
  const totalPagesMatch =
    t1.match(/Total\s*Pages\s*:?\s*(\d+)/i) || t2.match(/Total\s*Pages\s*:?\s*(\d+)/i);

  const sections = extractSectionList(t1);

  return {
    assembly: acMatch ? cleanLine(acMatch[1]).replace(/\s*Part\s*Number.*$/i, '') : null,
    part_number: partMatch ? Number(partMatch[1]) : null,
    polling_station,
    polling_address: address,
    pin_code: pinMatch ? pinMatch[1] : null,
    qualifying_date: qualMatch ? qualMatch[1] : null,
    publication_date: pubMatch ? pubMatch[1] : null,
    main_town: townMatch ? cleanLine(townMatch[1]) : null,
    post_office: postMatch ? cleanLine(postMatch[1]) : null,
    tehsil: tehsilMatch ? cleanLine(tehsilMatch[1]) : null,
    district: districtMatch ? cleanLine(districtMatch[1]) : null,
    total_pages: totalPagesMatch ? Number(totalPagesMatch[1]) : null,
    sections,
    page1_text: t1 || null,
    page2_text: t2 || null,
  };
}

module.exports = {
  parsePageMeta,
  parseRollCover,
  extractSectionList,
  cleanLine,
};
