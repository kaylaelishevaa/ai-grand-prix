import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import PhoneDemo, {phoneExperienceSource} from '../components/PhoneDemo';

test('phone presentation preserves only supported app and scenario controls', () => {
  assert.equal(phoneExperienceSource(), '/experience');
  assert.equal(phoneExperienceSource({utility:'call', presenter:'1', state:'night'}), '/experience?utility=call&presenter=1&state=night');
  assert.equal(phoneExperienceSource({utility:'world', state:'quiet'}), '/experience?utility=world&state=quiet');
  assert.equal(phoneExperienceSource({utility:'hatch'}), '/experience?utility=hatch');
  assert.equal(phoneExperienceSource({src:'https://outside.invalid', state:'<script>', presenter:'true', utility:['call','world'], profile:'replacement'}), '/experience');
});

test('server-rendered phone creates one same-origin app viewport with media permissions and no profile mutation control', () => {
  const html = renderToStaticMarkup(createElement(PhoneDemo, {query:{presenter:'1',state:'first'}}));
  assert.equal((html.match(/<iframe\b/g)||[]).length, 1);
  assert.match(html, /src="\/experience\?presenter=1&amp;state=first"/);
  assert.match(html, /allow="camera; microphone; autoplay"/);
  assert.match(html, /aria-label="Prepared homepage scenarios"/);
  assert(!html.includes('journey-shell'));
  assert(!html.toLowerCase().includes('reset'));
});
