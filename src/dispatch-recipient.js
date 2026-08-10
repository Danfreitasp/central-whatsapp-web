function serializeWppWid(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value._serialized === 'string' && value._serialized) return value._serialized;
  if (value.user && value.server) return `${value.user}@${value.server}`;
  if (typeof value.toString === 'function') {
    const serialized = value.toString();
    if (serialized && serialized !== '[object Object]') return serialized;
  }
  return '';
}

function normalizeWppPhone(value) {
  const serialized = serializeWppWid(value);
  const source = serialized || String(value || '');
  return source.split('@')[0].replace(/\D/g, '');
}

function getWppPhoneVariants(value) {
  const digits = normalizeWppPhone(value);
  if (!digits) return [];
  const variants = [digits];
  if (!digits.startsWith('55')) return variants;

  const localNumber = digits.slice(4);
  if (localNumber.length === 9 && localNumber[0] === '9' && /^[6-9]/.test(localNumber[1] || '')) {
    variants.push(`${digits.slice(0, 4)}${localNumber.slice(1)}`);
  } else if (localNumber.length === 8 && /^[6-9]/.test(localNumber[0] || '')) {
    variants.push(`${digits.slice(0, 4)}9${localNumber}`);
  }
  return [...new Set(variants)];
}

function callWppMapping(mappingFunction, value) {
  if (typeof mappingFunction !== 'function' || !value) return '';
  try {
    const result = mappingFunction(value);
    return result && typeof result.then !== 'function' ? result : '';
  } catch {
    return '';
  }
}

function knownWppRecipient(wpp, model) {
  const contact = model?.contact || model;
  const ids = [model?.id, contact?.id];
  const serializedIds = ids.map(serializeWppWid).filter(Boolean);
  const lidId = serializedIds.find((id) => id.endsWith('@lid')) || '';
  const phoneValues = [
    ...ids,
    model?.pnForLid,
    model?.phoneNumber,
    contact?.pnForLid,
    contact?.phoneNumber
  ];

  if (contact) {
    phoneValues.push(callWppMapping(wpp?.whatsapp?.getPnForLid, contact));
  }
  const lidWid = ids.find((id) => serializeWppWid(id).endsWith('@lid'));
  if (lidWid) {
    phoneValues.push(callWppMapping(wpp?.whatsapp?.ApiContact?.getPhoneNumber, lidWid));
    phoneValues.push(callWppMapping(wpp?.whatsapp?.lidPnCache?.getPhoneNumber, lidWid));
  }

  const phones = [...new Set(phoneValues.flatMap(getWppPhoneVariants))];
  return {
    lidId,
    phones
  };
}

async function findKnownWppRecipient(wpp, phoneId) {
  const models = [];
  if (typeof wpp?.contact?.list === 'function') {
    try { models.push(...await wpp.contact.list()); } catch {}
  }
  if (typeof wpp?.chat?.list === 'function') {
    try {
      models.push(...await wpp.chat.list({ onlyUsers: true, ignoreGroupMetadata: true }));
    } catch {}
  }

  const recipients = models.map((model) => knownWppRecipient(wpp, model));
  const targetPhones = getWppPhoneVariants(phoneId);
  const byPhone = recipients.find((item) => (
    item.lidId && item.phones.some((phone) => targetPhones.includes(phone))
  ));
  if (byPhone) return { chatId: byPhone.lidId, resolution: 'known-phone' };
  return null;
}

function isVisibleWppElement(element) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return rect.width > 3 && rect.height > 3 && style.display !== 'none' && style.visibility !== 'hidden';
}

function wppElementText(element) {
  return String(element?.innerText || element?.textContent || '').trim().replace(/\s+/g, ' ');
}

async function waitForWppUi(check, timeoutMs = 8000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const result = check();
    if (result) return result;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return null;
}

function findWppNewChatSearchBox() {
  const fields = [...document.querySelectorAll('input, textarea, [contenteditable="true"][role="textbox"], [contenteditable="true"]')]
    .filter(isVisibleWppElement);
  const described = fields.find((field) => {
    const description = [
      field.getAttribute('aria-label'),
      field.getAttribute('placeholder'),
      field.getAttribute('title')
    ].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return /pesquisar|buscar|search|nome|numero|number/.test(description);
  });
  return described || fields[0] || null;
}

function isWppNewChatOpen() {
  return [...document.querySelectorAll('h1, h2, h3, header, [role="heading"]')]
    .filter(isVisibleWppElement)
    .some((element) => {
      const text = wppElementText(element)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      return /(^|\s)nova conversa($|\s)|(^|\s)new chat($|\s)/.test(text);
    });
}

function fillWppSearchBox(field, value) {
  field.focus();
  if ('value' in field) {
    const prototype = field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (setter) setter.call(field, value);
    else field.value = value;
  } else {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(field);
    selection.removeAllRanges();
    selection.addRange(range);
    if (!document.execCommand('insertText', false, value)) field.textContent = value;
  }
  field.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    cancelable: true,
    data: value,
    inputType: 'insertText'
  }));
  field.dispatchEvent(new Event('change', { bubbles: true }));
}

async function openWppChatByPhoneSearch(wpp, candidateChatIds) {
  const targetPhones = [...new Set(candidateChatIds.flatMap(getWppPhoneVariants))];
  let searchBox = isWppNewChatOpen() ? findWppNewChatSearchBox() : null;
  if (!searchBox) {
    const icon = document.querySelector('[data-icon="new-chat-outline"], [data-icon="new-chat"]');
    let control = icon?.closest('button, [role="button"], [tabindex]') || null;
    if (!control) {
      control = [...document.querySelectorAll('button, [role="button"]')]
        .filter(isVisibleWppElement)
        .find((element) => {
          const description = [
            element.getAttribute('aria-label'),
            element.getAttribute('title'),
            wppElementText(element)
          ].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
          return /nova conversa|new chat/.test(description);
        }) || null;
    }
    if (!control) throw new Error('Não foi possível abrir a busca de Nova conversa.');
    control.click();
    searchBox = await waitForWppUi(findWppNewChatSearchBox);
  }
  if (!searchBox) throw new Error('A busca de Nova conversa não ficou disponível.');

  const searchPhone = normalizeWppPhone(candidateChatIds[0]);
  fillWppSearchBox(searchBox, searchPhone);

  const resultControl = await waitForWppUi(() => {
    const matches = [];
    for (const element of document.querySelectorAll('[role="listitem"], [role="button"], [tabindex], span, div')) {
      if (!isVisibleWppElement(element) || element === searchBox || element.contains(searchBox)) continue;
      const text = wppElementText(element);
      if (!text || text.length > 260) continue;
      const phonesInText = getWppPhoneVariants(text);
      if (!phonesInText.some((phone) => targetPhones.includes(phone))) continue;
      const clickable = element.closest('[role="listitem"], [role="button"], button, [tabindex]') || element;
      if (!isVisibleWppElement(clickable) || clickable.contains(searchBox)) continue;
      matches.push(clickable);
    }
    return [...new Set(matches)].sort((a, b) => {
      const ar = a.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return ar.width * ar.height - br.width * br.height;
    })[0] || null;
  });
  if (!resultControl) throw new Error('O WhatsApp não mostrou nenhum contato para este número.');

  resultControl.click();
  const activeChat = await waitForWppUi(() => {
    const composer = document.querySelector('footer [contenteditable="true"], footer textarea');
    if (!composer || !isVisibleWppElement(composer)) return null;
    return wpp?.chat?.getActiveChat?.() || null;
  });
  const activeChatId = serializeWppWid(activeChat?.id);
  if (!activeChatId) throw new Error('O contato foi encontrado, mas a conversa não terminou de abrir.');
  return activeChatId;
}

async function resolveWppDispatchRecipient(wpp, phone) {
  const requestedChatId = `${phone}@c.us`;
  const requestedChatIds = getWppPhoneVariants(requestedChatId).map((digits) => `${digits}@c.us`);
  if (typeof wpp?.contact?.queryWidExists !== 'function') {
    return {
      chatId: requestedChatId,
      candidateChatIds: requestedChatIds,
      phoneId: requestedChatId,
      usedLid: false,
      resolution: 'legacy-phone'
    };
  }

  const phoneIds = [];
  const lidIds = [];
  for (const candidateId of requestedChatIds) {
    let queryResult = null;
    try { queryResult = await wpp.contact.queryWidExists(candidateId); } catch {}
    if (!queryResult) continue;
    const phoneId = serializeWppWid(queryResult.wid) || candidateId;
    phoneIds.push(phoneId);
    let lidId = serializeWppWid(queryResult.lid);
    if (!lidId && typeof wpp.contact.getPnLidEntry === 'function') {
      try {
        const entry = await wpp.contact.getPnLidEntry(phoneId);
        lidId = serializeWppWid(entry?.lid);
      } catch {}
    }
    if (lidId) lidIds.push(lidId);
  }

  const knownRecipient = await findKnownWppRecipient(wpp, requestedChatId);
  if (knownRecipient) lidIds.push(knownRecipient.chatId);

  const candidateChatIds = [...new Set([...lidIds, ...phoneIds, ...requestedChatIds])];
  if (!phoneIds.length && !lidIds.length) {
    return {
      chatId: requestedChatIds[0],
      candidateChatIds: requestedChatIds,
      phoneId: requestedChatIds[0],
      usedLid: false,
      resolution: 'ui-search-needed'
    };
  }

  const chatId = candidateChatIds[0];
  const usedLid = chatId.endsWith('@lid');
  return {
    chatId,
    candidateChatIds,
    phoneId: phoneIds[0] || requestedChatId,
    usedLid,
    resolution: usedLid ? (knownRecipient?.resolution || 'query-lid') : 'phone-variants'
  };
}

function createWppRecipientRuntimeSource() {
  return [
    serializeWppWid,
    normalizeWppPhone,
    getWppPhoneVariants,
    callWppMapping,
    knownWppRecipient,
    findKnownWppRecipient,
    isVisibleWppElement,
    wppElementText,
    waitForWppUi,
    findWppNewChatSearchBox,
    isWppNewChatOpen,
    fillWppSearchBox,
    openWppChatByPhoneSearch,
    resolveWppDispatchRecipient
  ].map((fn) => `const ${fn.name} = ${fn.toString()};`).join('\n');
}

module.exports = {
  createWppRecipientRuntimeSource,
  findKnownWppRecipient,
  getWppPhoneVariants,
  normalizeWppPhone,
  openWppChatByPhoneSearch,
  resolveWppDispatchRecipient,
  serializeWppWid
};
