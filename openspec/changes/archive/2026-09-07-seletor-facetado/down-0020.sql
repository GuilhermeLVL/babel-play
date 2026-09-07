-- Rollback manual da migração 0020_sonda_de_ocorrencias (política aditivo-somente da casa).
DROP INDEX IF EXISTS idx_occ_probe;
