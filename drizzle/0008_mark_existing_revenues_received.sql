UPDATE commissions
SET status = 'recebida',
    received_at = '2026-09-15',
    updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE deleted_at IS NULL
  AND status NOT IN ('recebida', 'paga', 'cancelada');
