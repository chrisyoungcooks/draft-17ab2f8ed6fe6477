import fs from 'node:fs';
import path from 'node:path';

const eventPath = process.env.GITHUB_EVENT_PATH;
if (!eventPath) {
  throw new Error('GITHUB_EVENT_PATH is required');
}

const event = JSON.parse(fs.readFileSync(eventPath, 'utf8'));
const issue = event.issue;

if (!issue || !/^\[Review Note\]/i.test(issue.title || '')) {
  console.log('Not a review-note issue; nothing to publish.');
  process.exit(0);
}

function extractPayload(body = '') {
  const fenced = body.match(/```json\s*([\s\S]*?)```/i);
  if (fenced) return JSON.parse(fenced[1]);

  const comment = body.match(/<!--\s*review-note-json\s*([\s\S]*?)-->/i);
  if (comment) return JSON.parse(comment[1]);

  throw new Error('Review note issue does not contain a JSON payload.');
}

function normalizeShot(value) {
  const match = String(value || '').match(/\d+/);
  return match ? String(Number(match[0])) : '';
}

function normalizeRelatedShots(value, primaryShot) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[,\s]+/);
  return [...new Set(raw
    .map(normalizeShot)
    .filter(Boolean)
    .filter((shot) => shot !== primaryShot))];
}

function cleanText(value, fallback = '') {
  return String(value || fallback).trim();
}

function cleanAttachmentMeta(attachment) {
  if (!attachment || typeof attachment !== 'object') return null;
  return {
    name: cleanText(attachment.name, 'attachment'),
    type: cleanText(attachment.type, 'application/octet-stream'),
    size: Number(attachment.size) || 0,
    kind: cleanText(attachment.kind, 'file')
  };
}

const payload = extractPayload(issue.body || '');
if (payload.schema !== 'pulled-pork-review-note/v1') {
  throw new Error(`Unsupported review note schema: ${payload.schema || 'missing'}`);
}

const note = payload.note || {};
const shot = normalizeShot(note.shot);
if (!shot) throw new Error('Review note is missing a primary shot number.');
if (!cleanText(note.text)) throw new Error('Review note is missing note text.');

const createdAt = cleanText(note.createdAt, payload.submittedAt || new Date().toISOString());
const updatedAt = cleanText(note.updatedAt, payload.submittedAt || createdAt);
const id = cleanText(note.id, `issue-${issue.number}`);

const publishedNote = {
  id,
  shot,
  relatedShots: normalizeRelatedShots(note.relatedShots || note.related || note.appliesTo, shot),
  heading: cleanText(note.heading),
  target: cleanText(note.target, 'Shot'),
  author: cleanText(note.author),
  text: cleanText(note.text),
  attachments: [],
  createdAt,
  updatedAt,
  publishedAt: new Date().toISOString(),
  sourceIssue: issue.html_url
};

const localAttachments = Array.isArray(note.localAttachments)
  ? note.localAttachments.map(cleanAttachmentMeta).filter(Boolean)
  : [];

if (Number(note.localAttachmentCount) || localAttachments.length) {
  publishedNote.localAttachmentCount = Number(note.localAttachmentCount) || localAttachments.length;
  publishedNote.localAttachments = localAttachments;
}

const publishedPath = path.join('review-notes', 'published.json');
let packet = {
  schema: 'pulled-pork-review-notes/v1',
  updatedAt: null,
  notes: []
};

if (fs.existsSync(publishedPath)) {
  packet = JSON.parse(fs.readFileSync(publishedPath, 'utf8'));
  if (!Array.isArray(packet.notes)) packet.notes = [];
}

const existingIndex = packet.notes.findIndex((item) => item.id === publishedNote.id);
if (existingIndex >= 0) {
  packet.notes[existingIndex] = {
    ...packet.notes[existingIndex],
    ...publishedNote
  };
} else {
  packet.notes.push(publishedNote);
}

packet.schema = 'pulled-pork-review-notes/v1';
packet.updatedAt = new Date().toISOString();
packet.notes.sort((a, b) => {
  const shotA = Number(a.shot) || 0;
  const shotB = Number(b.shot) || 0;
  if (shotA !== shotB) return shotA - shotB;
  return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
});

fs.writeFileSync(publishedPath, `${JSON.stringify(packet, null, 2)}\n`);
console.log(`Published review note ${publishedNote.id} for shot ${publishedNote.shot}.`);
