# Central WhatsApp Web

Aplicativo local para abrir e organizar várias sessões independentes do WhatsApp Web em uma única janela.

A versão instalada pode ser consultada no menu nativo **Help**.

Na inicialização, o primeiro número aparece imediatamente e todas as outras
sessões começam a carregar em paralelo. Assim, a primeira troca entre números
não precisa iniciar o WhatsApp do zero. Somente a tela do número selecionado
fica anexada à janela; as outras sessões continuam conectadas em segundo plano.
A troca preserva a página, a conversa e os rascunhos. Não há modos de economia
que descarreguem uma sessão.

## Tela cinza ou preta

A versão 0.10.25 usa Electron 43.7.2, incluindo a correção de renderização de
telas ocultas publicada no Electron 43.4.1
([detalhes oficiais](https://releases.electronjs.org/pr/52844)). A recuperação
usa `WebContentsView` diretamente, substituindo a camada antiga `BrowserView`
e evitando acúmulo de listeners nas trocas de sessão. Ela
reconecta a tela ativa e força um novo quadro sem recarregar o WhatsApp. Ela
também atua ao restaurar a janela e retornar da suspensão do Windows.

- **Help → Recuperar tela do WhatsApp**, ou **Ctrl+Alt+R**, permite solicitar
  essa recuperação manualmente. O procedimento preserva o conteúdo da sessão.
- **Configurações → Compatibilidade gráfica (após reiniciar)** desativa a
  aceleração por hardware na próxima abertura. É uma alternativa para falhas
  relacionadas à GPU/driver e pode aumentar o uso de CPU. Encerre pela bandeja
  em **Sair** e abra novamente para aplicar; desmarque para voltar ao padrão.
- **Help → Abrir diagnóstico de tela** abre registros locais de falhas de
  captura, recuperação, encerramento de renderer/GPU e memória disponível.
  Os registros não incluem mensagens, telefones, capturas ou nomes de perfis,
  e têm rotação limitada a aproximadamente 1 MB no total.

O monitor ignora resultados de capturas que ficaram obsoletos após trocas,
minimização ou abertura de painéis; não intervém em perfis com disparos ativos.
Uma captura que falha ou retorna cinza não provoca reload automático. Se o
processo da sessão encerrar, a Central recria a sessão na mesma partição local.
A eliminação de falhas intermitentes precisa ser confirmada em uso prolongado;
os registros ajudam a distinguir a causa caso o sintoma volte.

## Disparos

O botão **Disparos** usa o número atualmente selecionado na barra lateral. Não é
necessário abrir o Chrome nem conectar uma segunda sessão.

- Importe `.xlsx`, `.xls` ou `.csv`; somente uma coluna com telefones é obrigatória.
  A Central reconhece títulos como `telefone`, `número`, `tel`, `celular`,
  `WhatsApp`, `fone`, `phone` e variações. Quando o título não é claro, ela
  analisa os valores e identifica automaticamente a coluna que contém telefones.
- Ou use **Colar lista** para informar um telefone por linha.
- Mensagens podem ser fixas ou usar variáveis como `{nome}`, `{primeiroNome}`,
  `{url}`, `{meuNome}` e os campos financeiros exibidos no painel.
- Os modelos já salvos na Central também podem ser selecionados no painel.
- A aba **Modelos** permite criar, copiar, editar o título e o texto ou excluir
  mensagens salvas. A versão 0.6.1 adiciona uma única vez quatro alternativas
  do modelo **Sem nome**, todas com as opções numeradas 1 e 2. Antes dessa
  inclusão, a biblioteca existente é preservada em
  `message-templates.before-0.6.1.json` na pasta local da Central.
- Os modelos ficam minimizados por padrão. Clique no título para expandir o
  conteúdo e os botões; ao abrir outro modelo, o anterior é recolhido.
- No modo **Variar modelos**, escolha a quantidade e os textos salvos que
  participarão do lote. A Central embaralha os modelos em ciclos equilibrados,
  sem repetir o mesmo texto em dois clientes consecutivos. A prévia informa o
  modelo atribuído a cada destinatário, e agendamentos preservam a distribuição.
- Telefones inválidos e repetidos são identificados antes do início.
- Antes de cada envio, o telefone é confirmado pelo WhatsApp e convertido para
  o identificador LID usado pelas sessões mais recentes.
- Se a consulta não devolver o LID, a Central procura a correspondência nos
  contatos e conversas já carregados naquela sessão.
- Para celulares brasileiros, a Central também reconhece quando o próprio
  WhatsApp corrige o telefone para a forma com ou sem o nono dígito.
- Se a integração não fornecer um LID, a Central usa a própria tela **Nova
  conversa**: pesquisa o telefone e envia ao primeiro resultado que contenha
  aquele número, sempre no mesmo perfil e sem recarregar a página.
- Depois da validação, a prévia permite escolher qualquer destinatário e mostra
  a mensagem final com as variáveis substituídas. O painel destaca o nome
  importado e avisa quando uma linha não possui nome.
- A pausa entre mensagens, a variação aleatória e o limite podem ser definidos
  antes do lote. Durante o envio, **Pausar/Continuar** preserva a posição da
  lista e **Parar** encerra após a mensagem que já estiver sendo processada.
- Um lote validado pode ser agendado para uma data e hora. Os agendamentos ficam
  salvos localmente e sobrevivem ao fechamento da Central; se ela estiver
  fechada no horário escolhido, o lote começa na próxima abertura. É possível
  manter até 25 agendamentos pendentes e cancelá-los pelo mesmo painel.
- Ao final, as falhas aparecem em um relatório separado com nome, telefone e
  motivo. O botão **Salvar CSV** exporta esse relatório para conferência.
- O botão **Histórico** mantém os 10.000 resultados mais recentes, incluindo
  data, número utilizado, destinatário, telefone, modelo, resultado e motivo do
  erro. A consulta pode ser filtrada e exportada em CSV.
- Números diferentes podem executar lotes simultaneamente. Cada perfil mantém
  seu próprio progresso, pausa, parada, intervalo e relatório de falhas; o
  limite é um lote ativo por perfil. Clique no perfil marcado **Em lote** para
  acompanhar ou controlar apenas aquele envio.

## Campanhas e planilhas grandes

O botão **Campanhas** mantém um gerenciador local para listas com milhares de
contatos. Depois de validar uma planilha no painel **Disparos**, informe o nome,
escolha a janela de bloqueio e clique em **Salvar campanha**.

- Todos os contatos válidos da planilha são importados, mesmo que o limite do
  lote atual seja menor. Cada execução pode processar até 5.000 contatos; listas
  maiores permanecem com o restante marcado como pendente para o próximo lote.
- Telefones repetidos na planilha são armazenados uma única vez.
- Os envios concluídos do histórico existente alimentam automaticamente o
  registro global. É possível bloquear contatos enviados nos últimos 30, 60,
  90, 180 ou 365 dias, nunca reenviar, ou limitar a regra à própria campanha.
- Cada contato fica como **Pendente**, **Enviado**, **Erro** ou **Já enviado**.
  O resultado é gravado imediatamente após cada tentativa, portanto uma
  interrupção não perde o progresso.
- O campo **Meta de envios efetivos** define quantas mensagens precisam ser
  concluídas com sucesso. Se a meta for 50 e 15 números falharem, a Central
  continua tentando os próximos pendentes até alcançar 50 enviados ou acabar a
  lista disponível. Contatos não tentados continuam pendentes. **Tentar erros**
  usa a mesma regra; **Liberar já enviados** permite uma exceção confirmada.
- O conteúdo da planilha gera uma identificação própria, impedindo que o mesmo
  arquivo seja salvo duas vezes com nomes diferentes.
- **Exportar CSV** gera uma conferência completa com telefone, situação, motivo,
  data, número utilizado e modelo de mensagem.

As campanhas e o registro global são salvos em `campaigns.db`, na pasta de dados
da Central. Excluir uma campanha não apaga o registro global dos telefones que
já receberam mensagens.

Depois de iniciar, o painel é fechado automaticamente e o lote continua em
segundo plano. O perfil remetente recebe o marcador **Enviando** e fica
temporariamente bloqueado para evitar interferência, mas os demais números da
Central continuam disponíveis. Em intervalos maiores que 30 segundos, o
remetente fica livre durante a espera e é reservado somente no momento de cada
envio. O botão **Disparos** mostra quantos lotes estão ativos; abra
o painel novamente se quiser consultar o log ou parar o lote. Quando termina, o
perfil remetente é liberado automaticamente.

## Uso

1. Instale o Node.js LTS.
2. No diretório deste projeto, execute `npm install`.
3. Execute `npm start`.
4. Clique em **Conectar outro número**, dê uma identificação e leia o QR Code correspondente dentro da área principal.
5. Repita o passo anterior para cada número. A lista à esquerda alterna entre as sessões.

## Modelos de mensagem

Use o botão **Modelos** no topo para salvar mensagens reutilizáveis. Os títulos e
textos podem ser editados, e o botão **Copiar** deixa o conteúdo pronto para ser
colado onde quiser.

## Histórico de disparos

O botão **Histórico** no topo reúne envios concluídos e erros de todos os
perfis. É possível filtrar por número utilizado ou resultado, pesquisar por
nome, telefone, modelo ou motivo e exportar a seleção para CSV. O histórico é
salvo localmente em `dispatch-history.json`, na pasta de dados da Central, e
mantém no máximo os 10.000 registros mais recentes.

## Nova conversa

Com um número do WhatsApp selecionado, use **Nova conversa** para abrir um telefone diretamente. Para um telefone brasileiro, digite apenas DDD + número; o aplicativo adiciona o DDI `55` automaticamente.

## Instalador Windows

Para gerar o instalador, execute `npm run build`. O arquivo `.exe` será criado na pasta `dist`. Instale-o pelo `.exe` para ter atalhos no Menu Iniciar/Área de Trabalho e suporte completo a cliques nas notificações do Windows.

## Atualizações

A versão instalada consulta apenas releases estáveis do repositório público de
artefatos `Danfreitasp/central-whatsapp-web-updates`. O código-fonte permanece
no repositório privado. O aplicativo não baixa uma atualização sem confirmação
e não oferece a instalação enquanto existir algum disparo em andamento.

O menu **Help > Verificar atualizações…** permite fazer uma consulta manual.
Também há uma consulta automática 15 segundos após a abertura e, enquanto o
aplicativo estiver aberto, a cada seis horas.

Para preparar uma versão, atualize o número no `package.json` e execute
`npm run release:draft`. O comando executa os testes, gera o instalador e cria
uma release em rascunho com o `.exe`, o `.blockmap` e o `latest.yml`. Releases
em rascunho e pré-lançamentos não são distribuídos. A release só deve ser
publicada como estável depois da instalação e dos testes manuais.

As sessões são salvas separadamente no perfil local do aplicativo. Todas as sessões já abertas permanecem ativas enquanto o aplicativo estiver em execução, para que a alternância entre números seja imediata. Isso usa mais memória e CPU conforme mais números forem conectados. Remover um item da lista não exclui automaticamente a sessão correspondente.

Passe o mouse sobre um número na lista e clique no ícone de lápis para editar sua identificação, sem alterar o login ou a sessão salva.

Também é possível arrastar um número na lista lateral para reorganizar a ordem. A escolha fica salva para as próximas aberturas do aplicativo.

Se o WhatsApp Web já estava aberto quando uma atualização do aplicativo for feita, feche e abra o aplicativo novamente para que a página seja recarregada.

## Limites e privacidade

- O aplicativo não lê o conteúdo das conversas. Os envios automatizados só são
  iniciados manualmente pelo painel **Disparos** e usam os telefones e a mensagem
  fornecidos pelo usuário.
- Microfone, câmera e notificações do WhatsApp Web são permitidos pelo aplicativo. Para o microfone ou a câmera funcionarem, o Windows também precisa permitir acesso para aplicativos de área de trabalho em **Configurações > Privacidade e segurança**.
- Quando um número em segundo plano receber novas mensagens, o aviso exibido é a
  notificação original do WhatsApp Web, que contém o direcionamento da conversa.
  A Central não cria uma segunda notificação genérica. O contador de não lidas
  continua aparecendo ao lado do número, sem que o aplicativo leia o texto da mensagem.
- No Windows, o número destacado na barra lateral é sincronizado com a sessão que
  recebeu o clique da notificação, sem interromper a abertura nativa da conversa.
  Na primeira abertura da versão instalada, a Central também
  cria ou corrige seu atalho do Menu Iniciar com o `AppUserModelId` e o
  `ToastActivatorCLSID` necessários para cliques vindos da Central de Ações.
- O computador mantém as sessões conectadas. Use bloqueio de tela e não compartilhe o perfil do sistema operacional.
- Uma mudança no WhatsApp Web pode exigir ajuste futuro no aplicativo.

## Dependências incorporadas

- SheetJS Community Edition 0.20.3 para leitura local de planilhas.
- WPPConnect WA-JS 4.5.0 para envio dentro da sessão aberta. A licença Apache
  2.0 está em `src/vendor/WPPConnect-LICENSE.txt`.
