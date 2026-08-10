const SEM_NOME_VARIANTS_MIGRATION = 'sem-nome-variants-v1';

const SEM_NOME_VARIANTS = [
  {
    name: 'Sem nome — Simulação disponível',
    body: `Olá! Tudo bem?

Sou Poliana, consultora financeira da Facilita Brasil, correspondente bancário conveniado ao INSS.
Identificamos condições que podem estar disponíveis em seu benefício, como:
📌 Portabilidade com possibilidade de troco
📌 Novo empréstimo com carência de 90 dias para o primeiro desconto

Para saber mais, responda com uma das opções:

1 - SIM, QUERO RECEBER UMA SIMULAÇÃO 💰
2 - NÃO QUERO RECEBER NOVAS MENSAGENS 🚫

https://www.facilitabrasiloficial.com.br`
  },
  {
    name: 'Sem nome — Análise do benefício',
    body: `Olá!

Aqui é a Poliana, da Facilita Brasil. Trabalhamos com soluções financeiras para beneficiários do INSS.
Em uma análise recente, encontramos a possibilidade de verificar valores para portabilidade com troco ou um novo empréstimo, com carência de 90 dias para a primeira parcela.

Caso queira consultar as condições, responda:

1 - SIM, DESEJO VER A SIMULAÇÃO 💵
2 - PREFIRO NÃO RECEBER MAIS MENSAGENS 🚫

https://www.facilitabrasiloficial.com.br`
  },
  {
    name: 'Sem nome — Oportunidade INSS',
    body: `Oi! Tudo bem?

Meu nome é Poliana e faço parte da equipe da Facilita Brasil, correspondente bancário conveniado ao INSS.
Podemos verificar oportunidades de redução de parcela por portabilidade, possibilidade de troco e novas condições de empréstimo.

Para continuar, escolha uma opção:

1 - QUERO RECEBER UMA SIMULAÇÃO SEM COMPROMISSO 💰
2 - NÃO TENHO INTERESSE E QUERO BLOQUEAR AS MENSAGENS 🚫

https://www.facilitabrasiloficial.com.br`
  },
  {
    name: 'Sem nome — Condições disponíveis',
    body: `Olá! Espero que esteja tudo bem.

Sou Poliana, consultora da Facilita Brasil. Atendemos beneficiários do INSS na consulta de condições para portabilidade e novos empréstimos.
Há possibilidade de encontrarmos uma alternativa com troco ou carência de 90 dias para o primeiro desconto da parcela.

Responda com a opção desejada:

1 - SIM, PODE ENVIAR AS CONDIÇÕES E A SIMULAÇÃO ✅
2 - NÃO DESEJO CONTINUAR NEM RECEBER OUTRAS MENSAGENS 🚫

https://www.facilitabrasiloficial.com.br`
  }
];

function normalize(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}

function applySemNomeVariantsMigration(templates, settings, idFactory) {
  const items = Array.isArray(templates) ? templates : [];
  const migrationSettings = settings && typeof settings === 'object' ? settings : {};
  const completed = new Set(Array.isArray(migrationSettings.templateMigrations) ? migrationSettings.templateMigrations : []);
  if (completed.has(SEM_NOME_VARIANTS_MIGRATION)) return { templates: items, settings: migrationSettings, added: 0, migrated: false };
  if (!items.some((template) => normalize(template.name) === 'sem nome')) {
    return { templates: items, settings: migrationSettings, added: 0, migrated: false };
  }

  const existingNames = new Set(items.map((template) => normalize(template.name)));
  const existingBodies = new Set(items.map((template) => normalize(template.body)));
  const additions = SEM_NOME_VARIANTS
    .filter((template) => !existingNames.has(normalize(template.name)) && !existingBodies.has(normalize(template.body)))
    .map((template) => ({ id: idFactory(), name: template.name, body: template.body }));

  completed.add(SEM_NOME_VARIANTS_MIGRATION);
  migrationSettings.templateMigrations = [...completed];
  return { templates: [...additions, ...items], settings: migrationSettings, added: additions.length, migrated: true };
}

module.exports = { SEM_NOME_VARIANTS, SEM_NOME_VARIANTS_MIGRATION, applySemNomeVariantsMigration };
