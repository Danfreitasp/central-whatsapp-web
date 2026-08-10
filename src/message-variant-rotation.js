function normalizeMessageVariants(variants) {
  const normalized = [];
  const seenIds = new Set();
  const seenBodies = new Set();
  for (const variant of Array.isArray(variants) ? variants : []) {
    const id = String(variant?.id || '').trim().slice(0, 120);
    const name = String(variant?.name || '').trim().slice(0, 60);
    const body = String(variant?.body || '').trim().slice(0, 4096);
    const bodyKey = body.replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
    if (!id || !body || seenIds.has(id) || seenBodies.has(bodyKey)) continue;
    seenIds.add(id);
    seenBodies.add(bodyKey);
    normalized.push({ id, name, body });
  }
  return normalized;
}

function shuffle(items, random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function createSuccessfulVariantRotation(variants, random = Math.random) {
  const items = normalizeMessageVariants(variants);
  if (items.length < 2) return null;

  let bag = [];
  let pending = null;
  let lastSuccessfulId = '';

  function refill() {
    bag = shuffle(items, random);
  }

  function next() {
    if (pending) return pending;
    if (!bag.length || !bag.some((variant) => variant.id !== lastSuccessfulId)) refill();
    let index = bag.findIndex((variant) => variant.id !== lastSuccessfulId);
    if (index < 0) index = 0;
    pending = bag.splice(index, 1)[0];
    return pending;
  }

  function complete(wasSent) {
    if (!pending) return;
    if (wasSent) lastSuccessfulId = pending.id;
    pending = null;
  }

  return { next, complete };
}

module.exports = { normalizeMessageVariants, createSuccessfulVariantRotation };
