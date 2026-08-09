-- Base PostgreSQL planejada para produção
CREATE TABLE admins (
  id UUID PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE campaigns (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  prize TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('numeros','dezena','centena','grupo')),
  price NUMERIC(12,2) NOT NULL CHECK (price > 0),
  total_tickets INTEGER NOT NULL CHECK (total_tickets > 0),
  image_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('ativa','pausada','encerrada')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tickets (
  id UUID PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES campaigns(id),
  number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('disponivel','reservado','vendido')),
  reservation_id UUID,
  reservation_expires_at TIMESTAMPTZ,
  UNIQUE(campaign_id, number)
);

CREATE TABLE payments (
  id UUID PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES campaigns(id),
  reservation_id UUID NOT NULL,
  provider TEXT NOT NULL,
  provider_payment_id TEXT,
  amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);
