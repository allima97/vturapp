-- Formas de Pagamento do Roteiro (PDF Moderno): subtítulo da modalidade,
-- condição comercial (título + descrição) e linha complementar do valor.
ALTER TABLE "legado_roteiro_pagamento" ADD COLUMN "forma_detalhe" TEXT;
ALTER TABLE "legado_roteiro_pagamento" ADD COLUMN "condicao" TEXT;
ALTER TABLE "legado_roteiro_pagamento" ADD COLUMN "condicao_detalhe" TEXT;
ALTER TABLE "legado_roteiro_pagamento" ADD COLUMN "valor_detalhe" TEXT;
