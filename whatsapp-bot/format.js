function fmtBRL(value) {
  return 'R$ ' + (Number(value) || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

module.exports = { fmtBRL };
