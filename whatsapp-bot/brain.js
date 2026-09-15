const Anthropic = require('@anthropic-ai/sdk');
const { betaTool } = require('@anthropic-ai/sdk/helpers/beta/json-schema');

const { CATS, TIPOS } = require('./config');
const { getMonthSnapshot, addExpense, addCasalExpense, monthKey } = require('./supabase');
const { fmtBRL } = require('./format');

const MODEL = 'claude-opus-5';
const client = new Anthropic();

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function buildSystemPrompt(snapshot, personNames, ownerIndex) {
  const hoje = new Date();
  const mesNome = `${MESES[hoje.getMonth()]} de ${hoje.getFullYear()}`;

  return `Você é o assistente financeiro do CasalFin, um app de controle de gastos de um casal. Você conversa pelo WhatsApp.

## Quem é quem
- Pessoa 0: ${personNames[0]}
- Pessoa 1: ${personNames[1]}
- Quem está falando com você agora é ${personNames[ownerIndex]} (pessoa ${ownerIndex}). Quando a pessoa disser "eu", "meu", "gastei", refere-se a ${personNames[ownerIndex]}.

## Mês atual: ${mesNome}
Data de hoje: ${hoje.toISOString().slice(0, 10)}

## Dados do mês (valores em reais)
Gastos variáveis de ${personNames[0]}:
${JSON.stringify(snapshot.p0, null, 1)}

Gastos variáveis de ${personNames[1]}:
${JSON.stringify(snapshot.p1, null, 1)}

Despesas fixas (resp: 0=${personNames[0]}, 1=${personNames[1]}, 2=Casal; só contam como gasto se "pago" for true):
${JSON.stringify(snapshot.fixos, null, 1)}

Parcelamentos (mesmo esquema de resp):
${JSON.stringify(snapshot.parc, null, 1)}

Entradas (receitas):
${JSON.stringify(snapshot.entradas, null, 1)}

## Totais já calculados (use estes, não recalcule)
- ${personNames[0]}: ${fmtBRL(snapshot.totals.p0)}
- ${personNames[1]}: ${fmtBRL(snapshot.totals.p1)}
- Casal (compartilhado): ${fmtBRL(snapshot.totals.couple)}
- Total geral do mês: ${fmtBRL(snapshot.totals.grandTotal)}

## Categorias válidas
${CATS.map(c => `- ${c.id}: ${c.l}`).join('\n')}

## Formas de pagamento válidas
${TIPOS.map(t => t.v).join(', ')}

## O que fazer com a mensagem
1. Se a pessoa está relatando um GASTO (ex: "ifood 45,90 nubank", "gastei 200 no mercado"), chame a ferramenta registrar_gasto. Deduza a categoria, a forma de pagamento e de quem é o gasto. Se a mensagem indicar que é um gasto compartilhado do casal ("casal", "nós dois", "juntos", "dividido"), use quem="casal". Se não ficar claro de quem é, assuma que é de quem está falando.
2. Se é uma PERGUNTA sobre as finanças (quanto gastei, quem gastou mais, no que gastei mais, quanto sobrou, etc.), responda usando os dados acima. Faça as contas que precisar.
3. Se a pessoa pedir várias coisas, atenda todas.
4. Se você realmente não entender, pergunte de forma curta o que ela quis dizer.

## Estilo da resposta
- Português brasileiro, tom informal e direto — é uma conversa de WhatsApp.
- Muito curto: 1 a 3 linhas. Nada de listas longas ou explicações do seu raciocínio.
- Valores sempre no formato R$ 1.234,56.
- Pode usar no máximo um emoji por mensagem.`;
}

function makeRegistrarGastoTool(personNames, ownerIndex) {
  return betaTool({
    name: 'registrar_gasto',
    description: 'Registra um novo gasto no CasalFin. Use quando a pessoa relatar uma despesa.',
    inputSchema: {
      type: 'object',
      properties: {
        nome: {
          type: 'string',
          description: 'Descrição curta do gasto, ex: "Mercado", "Uber pro aeroporto". Se a mensagem não der um nome específico, use o nome da categoria.',
        },
        valor: {
          type: 'number',
          description: 'Valor do gasto em reais, ex: 45.90',
        },
        categoria: {
          type: 'string',
          enum: CATS.map(c => c.id),
          description: 'Id da categoria que melhor descreve o gasto.',
        },
        tipo: {
          type: 'string',
          description: `Forma de pagamento, uma de: ${TIPOS.map(t => t.v).join(', ')}. Use string vazia se a pessoa não mencionar.`,
        },
        quem: {
          type: 'string',
          enum: ['0', '1', 'casal'],
          description: `"0" para ${personNames[0]}, "1" para ${personNames[1]}, "casal" para gasto compartilhado dos dois.`,
        },
      },
      required: ['nome', 'valor', 'categoria', 'quem'],
      additionalProperties: false,
    },
    run: async (input) => {
      const entry = {
        nome: input.nome,
        data: new Date().toISOString().slice(0, 10),
        tipo: input.tipo || '',
        cat: input.categoria,
        valor: String(input.valor),
      };
      if (input.quem === 'casal') {
        await addCasalExpense(entry);
      } else {
        await addExpense(Number(input.quem), entry);
      }
      const quemLabel = input.quem === 'casal' ? 'Casal' : personNames[Number(input.quem)];
      return `Gasto registrado: ${input.nome}, ${fmtBRL(input.valor)}, categoria ${input.categoria}, ${input.tipo || 'forma de pagamento não informada'}, atribuído a ${quemLabel}.`;
    },
  });
}

async function think(messageText, personNames, ownerIndex) {
  const snapshot = await getMonthSnapshot();
  const system = buildSystemPrompt(snapshot, personNames, ownerIndex);
  const tool = makeRegistrarGastoTool(personNames, ownerIndex);

  const runner = client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 8000,
    output_config: { effort: 'low' },
    system,
    tools: [tool],
    messages: [{ role: 'user', content: messageText }],
  });

  const final = await runner;

  if (final.stop_reason === 'refusal') {
    return '⚠️ Não consegui processar essa mensagem.';
  }

  const text = final.content
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join('\n')
    .trim();

  return text || '✅ Feito.';
}

module.exports = { think, monthKey };
