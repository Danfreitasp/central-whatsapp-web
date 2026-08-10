function preloadProfiles(profiles, { createView, setActiveProfile }) {
  const items = Array.isArray(profiles) ? profiles : [];
  if (!items.length) return 0;

  // O primeiro perfil recebe prioridade visual; os demais começam a navegar
  // logo depois, sem esperar a conclusão uns dos outros.
  createView(items[0]);
  setActiveProfile(items[0].id);
  for (const profile of items.slice(1)) createView(profile);
  return items.length;
}

module.exports = { preloadProfiles };
