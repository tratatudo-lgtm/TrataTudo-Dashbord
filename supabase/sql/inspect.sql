-- Queries para inspecionar o schema atual no Supabase SQL Editor
-- Corre isto para saberes os nomes reais das colunas e adaptares o código.

-- 1. Listar todas as tabelas no schema public
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public';

-- 2. Inspecionar colunas da tabela 'clients'
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'clients' AND table_schema = 'public';

-- 3. Inspecionar colunas da tabela 'messages'
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'messages' AND table_schema = 'public';

-- 4. Inspecionar colunas da tabela 'wa_messages'
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'wa_messages' AND table_schema = 'public';

-- 5. Inspecionar colunas da tabela 'admins'
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'admins' AND table_schema = 'public';

-- 6. Ver constraints (Foreign Keys, Primary Keys)
SELECT
    tc.table_name, kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
WHERE constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public';
