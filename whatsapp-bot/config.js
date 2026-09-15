require('dotenv').config();

module.exports = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,

  // Nomes padrão (índice 0 = Pessoa 1 / S.p0, índice 1 = Pessoa 2 / S.p1).
  // O bot tenta ler os nomes reais salvos no CasalFin (cf_m_p1/cf_m_p2) e só
  // cai nesses valores se ainda não houver nada salvo.
  DEFAULT_PERSON_NAMES: [
    process.env.PERSON0_NAME || 'Pessoa 1',
    process.env.PERSON1_NAME || 'Pessoa 2',
  ],

  CATS: [
    { id: 'mercado', l: 'Mercado', kw: ['mercado', 'supermercado', 'mercadinho', 'feira'] },
    { id: 'desp-ev', l: 'Desp. Eventuais', kw: ['eventual', 'imprevisto'] },
    { id: 'necess', l: 'Necessidades', kw: ['necessidade'] },
    { id: 'roupa', l: 'Roupa', kw: ['roupa', 'roupas', 'calca', 'camisa', 'tenis', 'sapato'] },
    { id: 'saude', l: 'Saúde', kw: ['saude', 'farmacia', 'remedio', 'medico', 'consulta', 'dentista'] },
    { id: 'presente', l: 'Presente', kw: ['presente', 'gift'] },
    { id: 'beleza', l: 'Beleza', kw: ['beleza', 'salao', 'cabelo', 'manicure', 'barbearia'] },
    { id: 'desenv', l: 'Desenvolvimento', kw: ['curso', 'livro', 'faculdade', 'desenvolvimento'] },
    { id: 'lazer', l: 'Lazer', kw: ['lazer', 'cinema', 'show', 'passeio', 'viagem', 'bar', 'balada'] },
    { id: 'eletron', l: 'Eletrônico', kw: ['eletronico', 'celular', 'notebook', 'fone', 'carregador'] },
    { id: 'assin', l: 'Assinatura', kw: ['assinatura', 'netflix', 'spotify', 'prime', 'hbo', 'disney'] },
    { id: 'uber', l: 'Uber/Transporte', kw: ['uber', 'taxi', 'transporte', 'onibus', 'gasolina', 'combustivel', 'estacionamento'] },
    { id: 'ifood', l: 'Ifood/Rest.', kw: ['ifood', 'restaurante', 'lanche', 'comida', 'rappi', 'almoco', 'janta', 'jantar'] },
    { id: 'contas', l: 'Contas', kw: ['conta', 'contas', 'luz', 'agua', 'internet', 'telefone', 'energia', 'boleto', 'aluguel', 'condominio'] },
    { id: 'invest', l: 'Investimento', kw: ['investimento', 'investir', 'aplicacao'] },
    { id: 'outros', l: 'Outros', kw: [] },
  ],

  TIPOS: [
    { v: 'Bradesco', kw: ['bradesco'] },
    { v: 'Nubank', kw: ['nubank', 'nu'] },
    { v: 'PagBank', kw: ['pagbank', 'pag bank', 'pagseguro'] },
    { v: 'Dinheiro', kw: ['dinheiro', 'cash', 'especie'] },
    { v: 'Pix', kw: ['pix'] },
    { v: 'Débito', kw: ['debito'] },
    { v: 'Crédito', kw: ['credito'] },
  ],
};
