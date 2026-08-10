(function exposeMessageVariants(root) {
  function shuffle(items, random = Math.random) {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function assignMessageVariants(recipientCount, templates, random = Math.random) {
    const unique = [];
    const seenIds = new Set();
    const seenBodies = new Set();
    for (const template of Array.isArray(templates) ? templates : []) {
      const id = String(template?.id || '');
      const bodyKey = String(template?.body || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
      if (!id || seenIds.has(id) || !bodyKey || seenBodies.has(bodyKey)) continue;
      seenIds.add(id);
      seenBodies.add(bodyKey);
      unique.push(template);
    }
    if (!unique.length || recipientCount <= 0) return [];

    const assignments = [];
    let previousId = '';
    while (assignments.length < recipientCount) {
      const cycle = shuffle(unique, random);
      if (cycle.length > 1 && cycle[0].id === previousId) {
        const replacement = cycle.findIndex((template) => template.id !== previousId);
        [cycle[0], cycle[replacement]] = [cycle[replacement], cycle[0]];
      }
      for (const template of cycle) {
        if (assignments.length >= recipientCount) break;
        assignments.push(template);
        previousId = template.id;
      }
    }
    return assignments;
  }

  const api = { assignMessageVariants };
  root.DispatchMessageVariants = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
}(typeof globalThis !== 'undefined' ? globalThis : window));
