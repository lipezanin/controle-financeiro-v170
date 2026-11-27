/** Traduz falha técnica para uma frase que a pessoa consegue agir. */
export function erroHumano(bruto: string): string {
  const m = bruto || "";
  if (/JWT expired|PGRST303/i.test(m)) return "A sessão da nuvem expirou. Entre de novo em Configurações.";
  if (/no such column|42703|PGRST204/i.test(m)) {
    return "A nuvem ainda não aceita um campo deste lançamento. O valor ficou neste computador.";
  }
  if (/23505|duplicate key/i.test(m)) return "Este item já existe na nuvem. Não foi duplicado.";
  if (/23502|not-null/i.test(m)) return "Faltou um campo obrigatório na nuvem. O valor ficou neste computador.";
  if (/PGRST205|schema cache/i.test(m)) return "A nuvem não reconhece esta tabela. O valor ficou neste computador.";
  if (/HTTP 304/i.test(m)) return "A cotação não mudou. Continua valendo o último valor.";
  if (/Failed to fetch|NetworkError|offline/i.test(m)) return "Sem conexão. O lançamento continua só neste computador.";
  if (m.length > 220) return "Não foi possível concluir. O detalhe técnico ficou no registro interno.";
  return m;
}
