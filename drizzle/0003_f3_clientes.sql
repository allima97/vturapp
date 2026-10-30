CREATE TABLE `cliente_anexos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`empresa_id` integer NOT NULL,
	`cliente_id` integer NOT NULL,
	`chave_r2` text(512) NOT NULL,
	`nome_original` text(255) NOT NULL,
	`content_type` text(100) NOT NULL,
	`tamanho_bytes` integer NOT NULL,
	`enviado_por` text(36),
	`criado_em` text NOT NULL,
	FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`enviado_por`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_cliente_anexos_chave` ON `cliente_anexos` (`chave_r2`);--> statement-breakpoint
CREATE INDEX `idx_cliente_anexos_cliente` ON `cliente_anexos` (`empresa_id`,`cliente_id`);--> statement-breakpoint
CREATE TABLE `clientes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`empresa_id` integer NOT NULL,
	`nome` text(200) NOT NULL,
	`tipo_pessoa` text(2) DEFAULT 'PF' NOT NULL,
	`documento` text(14) NOT NULL,
	`nascimento` text(10),
	`telefone` text(20) NOT NULL,
	`whatsapp` text(20),
	`email` text(320),
	`classificacao` text(1),
	`endereco` text(200),
	`numero` text(20),
	`complemento` text(100),
	`cidade` text(120),
	`estado` text(2),
	`cep` text(8),
	`rg` text(20),
	`genero` text(20),
	`nacionalidade` text(60),
	`tags` text DEFAULT '[]' NOT NULL,
	`tipo_cliente` text(30) DEFAULT 'passageiro' NOT NULL,
	`notas` text,
	`ativo` integer DEFAULT true NOT NULL,
	`versao` integer DEFAULT 1 NOT NULL,
	`criado_por` text(36),
	`criado_em` text NOT NULL,
	`atualizado_em` text NOT NULL,
	FOREIGN KEY (`empresa_id`) REFERENCES `empresas`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`criado_por`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_clientes_empresa_documento` ON `clientes` (`empresa_id`,`documento`);--> statement-breakpoint
CREATE INDEX `idx_clientes_empresa_nome` ON `clientes` (`empresa_id`,`nome`);--> statement-breakpoint
CREATE INDEX `idx_clientes_empresa_ativo` ON `clientes` (`empresa_id`,`ativo`);