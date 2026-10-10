-- Marca linhas novas/alteradas como pending. Não mexe em valores de negócio.

CREATE TABLE IF NOT EXISTS sync_conflitos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tabela TEXT NOT NULL,
  chave TEXT NOT NULL,
  local_json TEXT,
  nuvem_json TEXT,
  detectado_em TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS trg_transacoes_ai AFTER INSERT ON transacoes
BEGIN
  UPDATE transacoes SET updated_at = datetime('now'), sync_status = 'pending'
  WHERE id = NEW.id AND COALESCE(sync_status, '') IN ('', 'synced');
END;
CREATE TRIGGER IF NOT EXISTS trg_transacoes_au AFTER UPDATE ON transacoes
WHEN COALESCE(NEW.sync_status, '') = COALESCE(OLD.sync_status, '')
 AND COALESCE(NEW.updated_at, '') = COALESCE(OLD.updated_at, '')
BEGIN
  UPDATE transacoes SET updated_at = datetime('now'), sync_status = 'pending' WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_rendimentos_ai AFTER INSERT ON rendimentos
BEGIN
  UPDATE rendimentos SET updated_at = datetime('now'), sync_status = 'pending'
  WHERE id = NEW.id AND COALESCE(sync_status, '') IN ('', 'synced');
END;
CREATE TRIGGER IF NOT EXISTS trg_rendimentos_au AFTER UPDATE ON rendimentos
WHEN COALESCE(NEW.sync_status, '') = COALESCE(OLD.sync_status, '')
 AND COALESCE(NEW.updated_at, '') = COALESCE(OLD.updated_at, '')
BEGIN
  UPDATE rendimentos SET updated_at = datetime('now'), sync_status = 'pending' WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_despesas_ai AFTER INSERT ON despesas
BEGIN
  UPDATE despesas SET updated_at = datetime('now'), sync_status = 'pending'
  WHERE id = NEW.id AND COALESCE(sync_status, '') IN ('', 'synced');
END;
CREATE TRIGGER IF NOT EXISTS trg_despesas_au AFTER UPDATE ON despesas
WHEN COALESCE(NEW.sync_status, '') = COALESCE(OLD.sync_status, '')
 AND COALESCE(NEW.updated_at, '') = COALESCE(OLD.updated_at, '')
BEGIN
  UPDATE despesas SET updated_at = datetime('now'), sync_status = 'pending' WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_caixa_ai AFTER INSERT ON caixa_fisico
BEGIN
  UPDATE caixa_fisico SET updated_at = datetime('now'), sync_status = 'pending'
  WHERE id = NEW.id AND COALESCE(sync_status, '') IN ('', 'synced');
END;
CREATE TRIGGER IF NOT EXISTS trg_caixa_au AFTER UPDATE ON caixa_fisico
WHEN COALESCE(NEW.sync_status, '') = COALESCE(OLD.sync_status, '')
 AND COALESCE(NEW.updated_at, '') = COALESCE(OLD.updated_at, '')
BEGIN
  UPDATE caixa_fisico SET updated_at = datetime('now'), sync_status = 'pending' WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_rf_ai AFTER INSERT ON renda_fixa
BEGIN
  UPDATE renda_fixa SET updated_at = datetime('now'), sync_status = 'pending'
  WHERE id = NEW.id AND COALESCE(sync_status, '') IN ('', 'synced');
END;
CREATE TRIGGER IF NOT EXISTS trg_rf_au AFTER UPDATE ON renda_fixa
WHEN COALESCE(NEW.sync_status, '') = COALESCE(OLD.sync_status, '')
 AND COALESCE(NEW.updated_at, '') = COALESCE(OLD.updated_at, '')
BEGIN
  UPDATE renda_fixa SET updated_at = datetime('now'), sync_status = 'pending' WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_ativos_ai AFTER INSERT ON ativos
BEGIN
  UPDATE ativos SET updated_at = datetime('now'), sync_status = 'pending'
  WHERE id = NEW.id AND COALESCE(sync_status, '') IN ('', 'synced');
END;

CREATE TRIGGER IF NOT EXISTS trg_posicoes_ai AFTER INSERT ON posicoes
BEGIN
  UPDATE posicoes SET updated_at = datetime('now'), sync_status = 'pending'
  WHERE id = NEW.id AND COALESCE(sync_status, '') IN ('', 'synced');
END;
CREATE TRIGGER IF NOT EXISTS trg_posicoes_au AFTER UPDATE ON posicoes
WHEN COALESCE(NEW.sync_status, '') = COALESCE(OLD.sync_status, '')
 AND COALESCE(NEW.updated_at, '') = COALESCE(OLD.updated_at, '')
BEGIN
  UPDATE posicoes SET updated_at = datetime('now'), sync_status = 'pending' WHERE id = NEW.id;
END;
