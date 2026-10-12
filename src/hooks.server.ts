import { createSupabaseServerClient } from '$lib/db/supabase';
import { dev } from '$app/environment';
import { env as publicEnv } from '$env/dynamic/public';
import { sequence } from '@sveltejs/kit/hooks';
import { redirect, type Handle } from '@sveltejs/kit';
import {
	descobrirModulo,
	listarModulosComHeranca,
	MAPA_MODULOS,
	MODULO_ALIASES,
	isSystemModuleDisabled,
	isMissingSystemModuleSettingsTable
} from '$lib/admin/modules';
import {
	extractUserTypeName,
	isSystemAdminRole,
	isMasterRole,
	normalizeUserType
} from '$lib/server/admin';
import { hasVerifiedTotpFactor, normalizeMfaRedirectPath } from '$lib/server/authMfa';
import { resolveDashboardPathByUserType } from '$lib/server/dashboardRedirect';
import { checkPersistentRateLimit } from '$lib/server/persistentRateLimit';
import { logServerError } from '$lib/server/v1';
import { initKvNamespace, checkKvEpochAsync } from '$lib/server/kvInvalidation';
// Import so por efeito colateral -- garante que o registro de registerSalesReadModelDirtyMarker (ver reciboContribuicoesReadModel.ts)
// rode na inicializacao fria desta instancia do Worker, mesmo que a primeira rota atendida nao seja o dashboard nem uma rota de vendas
// (rotas +server.ts sao carregadas sob demanda; hooks.server.ts e sempre carregado antes de qualquer request).
import '$lib/server/reciboContribuicoesReadModel';
import { toUserMessage } from '$lib/utils/errors';

const permLevel = (p?: string | null): number => {
	switch ((p || '').toLowerCase()) {
		case 'admin': return 5;
		case 'delete': return 4;
		case 'edit': return 3;
		case 'create': return 2;
		case 'view': return 1;
		default: return 0;
	}
};

const normalizePermissao = (value?: string | null) => {
	const perm = (value || '').toLowerCase();
	if (perm === 'admin') return 'admin';
	if (perm === 'delete') return 'delete';
	if (perm === 'edit') return 'edit';
	if (perm === 'create') return 'create';
	if (perm === 'view') return 'view';
	return 'none';
};

const setPerm = (perms: Record<string, string>, key: string, perm: string) => {
	if (!key) return;
	const normalizedKey = key.toLowerCase();
	const atual = perms[normalizedKey] ?? 'none';
	perms[normalizedKey] = permLevel(perm) > permLevel(atual) ? perm : atual;
};

const normalizeModuloKey = (value?: string | null) => {
	const raw = String(value || '').trim().toLowerCase();
	if (!raw) return '';
	return MODULO_ALIASES[raw] || raw.replace(/\s+/g, '_');
};

type UserTypeLookupRow = {
	user_types?: { name?: string | null } | Array<{ name?: string | null }> | null;
};

type UserProfileRow = {
	id?: string | null;
	company_id?: string | null;
	nome_completo?: string | null;
	telefone?: string | null;
	cidade?: string | null;
	estado?: string | null;
	uso_individual?: boolean | null;
	active?: boolean | null;
	must_change_password?: boolean | null;
	user_types?: UserTypeLookupRow['user_types'];
};

type CompanyCommissionParamsRow = {
	mfa_obrigatorio?: boolean | null;
};

type DisabledModuleRow = {
	module_key?: string | null;
};

type AccessRow = {
	modulo: string | null;
	permissao: string | null;
	ativo: boolean | null;
};

type PermissionLevel = 'none' | 'view' | 'create' | 'edit' | 'delete' | 'admin';

type PlatformLike = {
	env?: Record<string, unknown> | null;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

const getErrorCode = (value: unknown) => (isRecord(value) ? String(value.code || '') : '');

const buildPerms = (
	rows: Array<{ modulo: string | null; permissao: string | null; ativo: boolean | null }>
) => {
	const perms: Record<string, string> = {};
	for (const registro of rows) {
		const modulo = String(registro.modulo || '').toLowerCase();
		if (!modulo) continue;
		const permissaoNormalizada = normalizePermissao(registro.permissao);
		const finalPerm = registro.ativo ? permissaoNormalizada : 'none';
		setPerm(perms, modulo, finalPerm);
		const alias = MODULO_ALIASES[modulo];
		if (alias) setPerm(perms, alias, finalPerm);
	}
	return perms;
};

function normalizePathname(pathname: string) {
	if (pathname === '/') return '/';
	return pathname.replace(/\/+$/, '') || '/';
}

function pathMatchesPrefix(pathname: string, prefix: string) {
	if (prefix === '/') return pathname === '/';
	if (prefix.endsWith('/')) return pathname.startsWith(prefix);
	if (pathname === prefix) return true;
	return pathname.startsWith(`${prefix}/`);
}

function ensureVaryHeader(response: Response, value: string) {
	const current = response.headers.get('Vary');
	if (!current) {
		response.headers.set('Vary', value);
		return;
	}
	if (current.trim() === '*') return;
	const normalized = value.toLowerCase();
	const existing = current
		.split(',')
		.map((item) => item.trim().toLowerCase())
		.filter(Boolean);
	if (!existing.includes(normalized)) {
		response.headers.set('Vary', `${current}, ${value}`);
	}
}

function isDashboardCanonicalRoute(pathname: string) {
	return (
		pathname === '/' ||
		pathname === '/dashboard' ||
		pathname === '/dashboard/geral' ||
		pathname === '/dashboard/vendedor' ||
		pathname === '/dashboard/gestor' ||
		pathname === '/dashboard/financeiro' ||
		pathname === '/dashboard/master'
	);
}

function buildLoginRedirectUrl(url: URL) {
	const nextPath = `${url.pathname}${url.search || ''}`;
	return `/auth/login?next=${encodeURIComponent(nextPath)}`;
}

function buildMfaSetupRedirectUrl(url: URL) {
	const nextPath = `${url.pathname}${url.search || ''}`;
	return `/perfil?setup_2fa=1&next=${encodeURIComponent(nextPath)}`;
}

function isUnsafeHttpMethod(method: string) {
	return ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase());
}

const PUBLIC_AUTH_MAX_BODY_BYTES = 32 * 1024;
const AUTHENTICATED_API_MAX_BODY_BYTES = 10 * 1024 * 1024;
const AUTHENTICATED_API_UPLOAD_MAX_BODY_BYTES = 20 * 1024 * 1024;

function buildCspPolicy() {
	const connectSrc = ["'self'", 'https://challenges.cloudflare.com', 'https://cloudflareinsights.com'];
	const supabaseUrl = String(publicEnv.PUBLIC_SUPABASE_URL || '').trim();
	if (supabaseUrl) {
		try {
			const parsed = new URL(supabaseUrl);
			connectSrc.push(parsed.origin);
			if (parsed.protocol === 'https:') connectSrc.push(`wss://${parsed.host}`);
			if (parsed.protocol === 'http:') connectSrc.push(`ws://${parsed.host}`);
		} catch {
			// Mantém a CSP fechada; configuração inválida já quebra o cliente Supabase.
		}
	}
	if (dev) {
		connectSrc.push('http:', 'https:', 'ws:', 'wss:');
	}

	return [
		"default-src 'self'",
		"base-uri 'self'",
		"object-src 'none'",
		"frame-ancestors 'none'",
		"img-src 'self' data: blob: https:",
		"font-src 'self' data: https:",
		"style-src 'self' 'unsafe-inline' https:",
		dev
			? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com https://static.cloudflareinsights.com"
			: "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://static.cloudflareinsights.com",
		`connect-src ${Array.from(new Set(connectSrc)).join(' ')}`,
		"frame-src https://challenges.cloudflare.com",
		"worker-src 'self' blob:",
		"form-action 'self'"
	].join('; ');
}

type RateLimitRule = {
	prefix: string;
	limit: number;
	windowMs: number;
	methods?: string[];
};

const PUBLIC_API_RATE_LIMITS: RateLimitRule[] = [
	{ prefix: '/api/auth/convite/activate', methods: ['POST'], limit: 8, windowMs: 60_000 },
	{ prefix: '/api/auth/login', methods: ['POST'], limit: 8, windowMs: 60_000 },
	{ prefix: '/api/auth/passkeys/login', methods: ['POST'], limit: 12, windowMs: 60_000 },
	{ prefix: '/api/auth/set-session', methods: ['POST'], limit: 40, windowMs: 60_000 },
	{ prefix: '/api/auth/turnstile/verify', methods: ['POST'], limit: 20, windowMs: 60_000 },
	{ prefix: '/api/v1/cards', limit: 60, windowMs: 60_000 },
	{ prefix: '/api/v1/client-error', methods: ['POST'], limit: 30, windowMs: 60_000 },
	{ prefix: '/api/v1/cron/', limit: 30, windowMs: 60_000 }
];

const SYSTEM_ADMIN_BLOCKED_API_PREFIXES = [
	'/api/v1/financeiro/ajustes-vendas',
	'/api/v1/parametros/escalas'
];

const AUTHENTICATED_API_UPLOAD_PREFIXES = [
	'/api/v1/voucher-assets',
	'/api/v1/pagamentos/upload'
];

const API_ACTIVE_STATUS_CACHE_TTL_MS = 30_000;
const apiActiveStatusCache = new Map<string, { active: boolean; expiresAt: number }>();

function isAuthenticatedUploadApi(pathname: string) {
	return AUTHENTICATED_API_UPLOAD_PREFIXES.some((prefix) => pathMatchesPrefix(pathname, prefix));
}

async function getCachedApiActiveStatus(event: Parameters<Handle>[0]['event'], userId: string) {
	const id = String(userId || '').trim();
	if (!id) return true;
	const now = Date.now();
	const cached = apiActiveStatusCache.get(id);
	if (cached && cached.expiresAt > now) return cached.active;

	const { data, error } = await event.locals.supabase
		.from('users')
		.select('id, active')
		.eq('id', id)
		.maybeSingle();
	if (error || !data) return true;

	const active = data.active !== false;
	apiActiveStatusCache.set(id, { active, expiresAt: now + API_ACTIVE_STATUS_CACHE_TTL_MS });
	return active;
}

function resolveClientAddress(event: Parameters<Handle>[0]['event']) {
	try {
		const runtimeAddress = event.getClientAddress();
		if (runtimeAddress) return runtimeAddress;
	} catch {
		// Continua para headers controlados pelo provedor quando o adapter não expõe IP.
	}

	const cloudflareIp = event.request.headers.get('cf-connecting-ip')?.trim();
	if (cloudflareIp) return cloudflareIp;

	return 'unknown';
}

function findPublicApiRateLimit(pathname: string, method: string) {
	const normalizedMethod = method.toUpperCase();
	return PUBLIC_API_RATE_LIMITS.find((rule) => {
		if (!pathMatchesPrefix(pathname, rule.prefix)) return false;
		return !rule.methods || rule.methods.includes(normalizedMethod);
	});
}

async function checkPublicApiRateLimit(event: Parameters<Handle>[0]['event'], rule: RateLimitRule) {
	const result = await checkPersistentRateLimit('public-api', `${rule.prefix}:${resolveClientAddress(event)}`, {
		max: rule.limit,
		windowMs: rule.windowMs
	});
	return result.allowed ? null : result.retryAfterSeconds;
}

async function isSystemAdminApiUser(event: Parameters<Handle>[0]['event'], userId: string) {
	const { data, error } = await event.locals.supabase
		.from('users')
		.select('user_types(name)')
		.eq('id', userId)
		.maybeSingle();
	if (error) return false;
	return isSystemAdminRole(normalizeUserType(extractUserTypeName(data as UserTypeLookupRow | null)));
}

function isRequestBodyTooLarge(event: Parameters<Handle>[0]['event'], limitBytes: number) {
	const raw = event.request.headers.get('content-length');
	if (!raw) return false;
	const length = Number(raw);
	return Number.isFinite(length) && length > limitBytes;
}

function hasRequestBody(event: Parameters<Handle>[0]['event']) {
	const rawLength = event.request.headers.get('content-length');
	if (rawLength) {
		const length = Number(rawLength);
		if (Number.isFinite(length)) return length > 0;
	}
	return Boolean(event.request.headers.get('content-type'));
}

function isJsonMutationContentType(event: Parameters<Handle>[0]['event']) {
	if (!hasRequestBody(event)) return true;
	const contentType = event.request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
	return contentType === 'application/json' || contentType === 'application/merge-patch+json';
}

function isSameOriginMutation(event: Parameters<Handle>[0]['event']) {
	const origin = event.request.headers.get('origin');
	const fetchSite = event.request.headers.get('sec-fetch-site')?.toLowerCase();

	if (origin) {
		try {
			if (new URL(origin).origin !== event.url.origin) return false;
		} catch {
			return false;
		}
	}

	if (fetchSite && !['same-origin', 'same-site', 'none'].includes(fetchSite)) return false;
	if (!origin && !fetchSite) return false;

	return true;
}

function resolveAuthenticatedApiBodyLimit(pathname: string) {
	return isAuthenticatedUploadApi(pathname)
		? AUTHENTICATED_API_UPLOAD_MAX_BODY_BYTES
		: AUTHENTICATED_API_MAX_BODY_BYTES;
}

const supabaseHook: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createSupabaseServerClient({
		get: (name) => event.cookies.get(name),
		getAll: () => event.cookies.getAll().map((cookie) => ({ name: cookie.name, value: cookie.value })),
		set: (name, value, options) => {
			event.cookies.set(name, value, { ...options, path: '/' });
		},
		remove: (name, options) => {
			event.cookies.delete(name, { ...options, path: '/' });
		}
	});

	// Inicializar KV namespace e verificar epoch de invalidação cross-instance.
	// initKvNamespace é idempotente — apenas guarda referência na primeira chamada.
	// checkKvEpochAsync é throttled (5s) e fire-and-forget — não bloqueia requests.
	const platformEnv = isRecord(event.platform) ? (event.platform as PlatformLike).env ?? null : null;
	initKvNamespace(platformEnv);
	checkKvEpochAsync();

	let safeSessionPromise: ReturnType<typeof event.locals.safeGetSession> | null = null;
	event.locals.safeGetSession = async () => {
		if (safeSessionPromise) return safeSessionPromise;
		safeSessionPromise = (async () => {
		const { data: { session } } = await event.locals.supabase.auth.getSession();
		if (!session) return { session: null, user: null };
		const { data: { user }, error } = await event.locals.supabase.auth.getUser();
		if (error) return { session: null, user: null };
		return { session, user };
		})();
		return safeSessionPromise;
	};

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};

const securityHeadersHook: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('X-Permitted-Cross-Domain-Policies', 'none');
	response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
	response.headers.set('Origin-Agent-Cluster', '?1');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set(
		'Permissions-Policy',
		'camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self), clipboard-read=(), clipboard-write=(), bluetooth=()'
	);
	response.headers.set(
		dev ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy',
		buildCspPolicy()
	);

	const forwardedProto = event.request.headers.get('x-forwarded-proto');
	if (event.url.protocol === 'https:' || forwardedProto === 'https') {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
	}

	if (
		pathMatchesPrefix(event.url.pathname, '/api') &&
		(isUnsafeHttpMethod(event.request.method) || response.status >= 400)
	) {
		response.headers.set('Cache-Control', 'no-store');
		ensureVaryHeader(response, 'Cookie');
	}

	return response;
};

const authGuard: Handle = async ({ event, resolve }) => {
	const { url } = event;
	const pathname = url.pathname;
	const isApiRequest = pathMatchesPrefix(pathname, '/api');
	const apiPublicRoutes = [
		'/api/auth/login',
		'/api/auth/convite/activate',
		'/api/auth/passkeys/login',
		'/api/auth/set-session',
		'/api/auth/turnstile/verify',
		'/api/v1/cards',
		'/api/v1/client-error',
		'/api/v1/health',
		'/api/v1/cron/',
		'/api/v1/read-model/rebuild'
	];

	const rotasPublicas = [
		'/auth/login',
		'/auth/logout',
		'/auth/register',
		'/auth/recover',
		'/auth/recuperar-senha',
		'/auth/reset',
		'/auth/nova-senha',
		'/auth/convite',
		'/auth/update-password',
		'/manutencao',
		'/favicon',
		'/favicon.ico',
		'/icons',
		'/brand',
		'/manifest.webmanifest',
		'/manifest-calculadora.webmanifest',
		'/sw-calculadora.js',
		'/_app',
		'/assets',
		'/public',
		'/pdfs',
		'/calculadora'
	];

	const isPublic = rotasPublicas.some((r) => pathMatchesPrefix(pathname, r));
	if (isPublic) {
		return resolve(event);
	}

	if (isApiRequest) {
		const isApiPublic = apiPublicRoutes.some((route) => pathMatchesPrefix(pathname, route));
		if (isApiPublic) {
			const rateLimitRule = findPublicApiRateLimit(pathname, event.request.method);
			const retryAfter = rateLimitRule ? await checkPublicApiRateLimit(event, rateLimitRule) : null;
			if (retryAfter) {
				return new Response(JSON.stringify({ error: 'Muitas tentativas. Aguarde e tente novamente.' }), {
					status: 429,
					headers: {
						'content-type': 'application/json; charset=utf-8',
						'retry-after': String(retryAfter),
						'cache-control': 'no-store'
					}
				});
			}

			if (
				pathMatchesPrefix(pathname, '/api/auth') &&
				isUnsafeHttpMethod(event.request.method) &&
				!isSameOriginMutation(event)
			) {
				return new Response(JSON.stringify({ error: 'Origem da requisicao invalida.' }), {
					status: 403,
					headers: {
						'content-type': 'application/json; charset=utf-8',
						'cache-control': 'no-store'
					}
				});
			}
			if (
				pathMatchesPrefix(pathname, '/api/auth') &&
				isUnsafeHttpMethod(event.request.method) &&
				!isJsonMutationContentType(event)
			) {
				return new Response(JSON.stringify({ error: 'Tipo de conteudo invalido.' }), {
					status: 415,
					headers: {
						'content-type': 'application/json; charset=utf-8',
						'cache-control': 'no-store'
					}
				});
			}
			if (
				pathMatchesPrefix(pathname, '/api/auth') &&
				isUnsafeHttpMethod(event.request.method) &&
				isRequestBodyTooLarge(event, PUBLIC_AUTH_MAX_BODY_BYTES)
			) {
				return new Response(JSON.stringify({ error: 'Corpo da requisicao muito grande.' }), {
					status: 413,
					headers: {
						'content-type': 'application/json; charset=utf-8',
						'cache-control': 'no-store'
					}
				});
			}
			return resolve(event);
		}

		if (isUnsafeHttpMethod(event.request.method) && !isSameOriginMutation(event)) {
			return new Response(JSON.stringify({ error: 'Origem da requisicao invalida.' }), {
				status: 403,
				headers: {
					'content-type': 'application/json; charset=utf-8',
					'cache-control': 'no-store'
				}
			});
		}

		if (
			isUnsafeHttpMethod(event.request.method) &&
			!isAuthenticatedUploadApi(pathname) &&
			!isJsonMutationContentType(event)
		) {
			return new Response(JSON.stringify({ error: 'Tipo de conteudo invalido.' }), {
				status: 415,
				headers: {
					'content-type': 'application/json; charset=utf-8',
					'cache-control': 'no-store'
				}
			});
		}

		if (
			isUnsafeHttpMethod(event.request.method) &&
			isRequestBodyTooLarge(event, resolveAuthenticatedApiBodyLimit(pathname))
		) {
			return new Response(JSON.stringify({ error: 'Corpo da requisicao muito grande.' }), {
				status: 413,
				headers: {
					'content-type': 'application/json; charset=utf-8',
					'cache-control': 'no-store'
				}
			});
		}

		const { session, user } = await event.locals.safeGetSession();
		event.locals.session = session;
		event.locals.user = user;

		if (!session || !user) {
			return new Response(JSON.stringify({ error: 'Sessao invalida.' }), {
				status: 401,
				headers: {
					'content-type': 'application/json; charset=utf-8',
					'cache-control': 'no-store'
				}
			});
		}

		const isSystemAdminBlockedApi = SYSTEM_ADMIN_BLOCKED_API_PREFIXES.some((prefix) =>
			pathMatchesPrefix(pathname, prefix)
		);
		const apiUserActive = await getCachedApiActiveStatus(event, user.id);
		if (!apiUserActive) {
			return new Response(JSON.stringify({ error: 'Usuario inativo.' }), {
				status: 403,
				headers: {
					'content-type': 'application/json; charset=utf-8',
					'cache-control': 'no-store'
				}
			});
		}
		if (isSystemAdminBlockedApi && (await isSystemAdminApiUser(event, user.id))) {
			return new Response(JSON.stringify({ error: 'Sem acesso.' }), {
				status: 403,
				headers: {
					'content-type': 'application/json; charset=utf-8',
					'cache-control': 'no-store'
				}
			});
		}

		return resolve(event);
	}

	const { session, user } = await event.locals.safeGetSession();
	event.locals.session = session;
	event.locals.user = user;

	if (!session || !user) {
		throw redirect(303, buildLoginRedirectUrl(url));
	}

	const supabase = event.locals.supabase;

	// Query 1: modulo_acesso + tipo de usuario em paralelo
	const [accRowsRes, userProfileRes] = await Promise.all([
		supabase
			.from('modulo_acesso')
			.select('modulo, permissao, ativo')
			.eq('usuario_id', user.id),
		// Consolida: tipo, must_change_password, perfil e company_id numa unica query
		supabase
			.from('users')
			.select('id, company_id, nome_completo, telefone, cidade, estado, uso_individual, active, must_change_password, user_types(name)')
			.eq('id', user.id)
			.maybeSingle()
	]);

	const acessos = buildPerms(
		(accRowsRes.data || []) as Array<{ modulo: string | null; permissao: string | null; ativo: boolean | null }>
	);

	const perfil = userProfileRes.data as UserProfileRow | null;
	const rawType = extractUserTypeName(perfil);
	const userType = normalizeUserType(rawType);
	const isSystemAdmin = isSystemAdminRole(userType);

	event.locals.userType = userType;
	event.locals.isSystemAdmin = isSystemAdmin;
	event.locals.acessos = acessos;

	if (perfil && perfil.active === false) {
		throw redirect(303, '/negado');
	}

	// Verificar troca obrigatoria de senha
	const rotasSenhaObrigatoriaPermitidas = ['/perfil', '/auth', '/api/companies', '/api/welcome-email', '/api/users'];
	const isSenhaObrigatoriaAllowed = rotasSenhaObrigatoriaPermitidas.some((prefix) => pathMatchesPrefix(pathname, prefix));

	if (!isSenhaObrigatoriaAllowed) {
		const missingColumn =
			getErrorCode(userProfileRes.error) === '42703' ||
			toUserMessage(userProfileRes.error, '').toLowerCase().includes('must_change_password');

		if (!userProfileRes.error || missingColumn) {
			if (Boolean(perfil?.must_change_password)) {
				throw redirect(303, '/perfil?force_password=1');
			}
		} else {
			logServerError('[hooks.server] falha ao verificar troca obrigatoria de senha', userProfileRes.error);
		}
	}

	// Bloqueio de onboarding (reutiliza perfil ja carregado)
	const rotasOnboardingPermitidas = ['/perfil', '/auth', '/api/companies', '/api/welcome-email'];
	const isOnboardingAllowed = rotasOnboardingPermitidas.some((prefix) => pathMatchesPrefix(pathname, prefix));

	if (!isOnboardingAllowed && perfil) {
		const precisaOnboarding =
			!perfil?.nome_completo ||
			!perfil?.telefone ||
			!perfil?.cidade ||
			!perfil?.estado ||
			perfil?.uso_individual === null ||
			perfil?.uso_individual === undefined;
		if (precisaOnboarding) {
			throw redirect(303, '/perfil/onboarding');
		}
	}

	// MFA
	const isMfaRoute = pathMatchesPrefix(pathname, '/auth/mfa');
	const companyId = String(perfil?.company_id || '').trim() || null;
	try {
		let mfaObrigatorio = false;
		if (companyId) {
			const { data: paramData, error: paramErr } = await supabase
				.from('parametros_comissao')
				.select('mfa_obrigatorio')
				.eq('company_id', companyId)
				.maybeSingle();
			if (paramErr) throw paramErr;
			mfaObrigatorio = Boolean((paramData as CompanyCommissionParamsRow | null)?.mfa_obrigatorio);
		}

		const [{ data: aalData, error: aalError }, { data: factorsData, error: factorsError }] =
			await Promise.all([
				supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
				supabase.auth.mfa.listFactors()
			]);

		if (!aalError && !factorsError) {
			const hasFactor = hasVerifiedTotpFactor(factorsData || null);
			if (mfaObrigatorio && !hasFactor && !pathMatchesPrefix(pathname, '/perfil')) {
				throw redirect(303, buildMfaSetupRedirectUrl(url));
			}
			const precisaMfa = hasFactor && aalData?.nextLevel === 'aal2' && aalData?.currentLevel !== 'aal2';
			if (precisaMfa && !isMfaRoute) {
				const nextPath = normalizeMfaRedirectPath(`${pathname}${url.search || ''}`, '/dashboard');
				throw redirect(303, `/auth/mfa?next=${encodeURIComponent(nextPath)}`);
			}
		}
	} catch (mfaError) {
		logServerError('[hooks.server] falha ao verificar MFA', mfaError);
	}

	// Dashboard canonico
	const normalizedPathname = normalizePathname(pathname);
	if (isDashboardCanonicalRoute(normalizedPathname)) {
		const canonicalDashboardPath = resolveDashboardPathByUserType(userType, '/');
		if (normalizedPathname !== canonicalDashboardPath) {
			const targetUrl = new URL(canonicalDashboardPath, url);
			targetUrl.search = url.search;
			throw redirect(303, targetUrl.toString());
		}
	}

	const isDebugUiRoute = pathMatchesPrefix(pathname, '/debug') || pathMatchesPrefix(pathname, '/diagnostico');
	if (isDebugUiRoute && !dev) {
		throw redirect(303, '/negado');
	}

	if (isSystemAdmin) {
		const isSystemAdminAllowedRoute =
			pathMatchesPrefix(pathname, '/admin') ||
			pathMatchesPrefix(pathname, '/dashboard/admin') ||
			pathMatchesPrefix(pathname, '/dashboard/logs') ||
			(pathMatchesPrefix(pathname, '/perfil') && !pathMatchesPrefix(pathname, '/perfil/escala')) ||
			pathMatchesPrefix(pathname, '/negado') ||
			pathMatchesPrefix(pathname, '/documentacao');

		if (!isSystemAdminAllowedRoute) {
			throw redirect(303, '/dashboard/admin');
		}

		return resolve(event);
	}

	if (pathMatchesPrefix(pathname, '/admin') || pathMatchesPrefix(pathname, '/dashboard/admin')) {
		throw redirect(303, '/negado');
	}

	if (
		pathMatchesPrefix(pathname, '/perfil') ||
		pathMatchesPrefix(pathname, '/negado') ||
		pathMatchesPrefix(pathname, '/documentacao') ||
		// Dashboards canônicos são acessíveis a qualquer usuário autenticado; rotas
		// administrativas sob /dashboard/* continuam passando pela checagem de módulo.
		pathname === '/' ||
		isDashboardCanonicalRoute(normalizedPathname)
	) {
		return resolve(event);
	}

	// Rotas master: exclusivas do papel MASTER
	// Exceção: /master/permissoes também é acessível para quem tem permissão MasterPermissoes
	// (ex: Gestores com essa permissão atribuída) — igual ao vtur-app
	if (pathMatchesPrefix(pathname, '/master')) {
		const isMaster = isMasterRole(userType);
		if (!isMaster) {
			const isMasterPermissoesRoute =
				pathname === '/master/permissoes' || pathMatchesPrefix(pathname, '/master/permissoes');
			const temPermissao =
				isMasterPermissoesRoute &&
				['view', 'create', 'edit', 'delete', 'admin'].includes(
					String(acessos['master_permissoes'] || '')
				);
			if (!temPermissao) throw redirect(303, '/negado');
		}
		return resolve(event);
	}

	const modulo = descobrirModulo(pathname);
	if (!modulo) return resolve(event);

	try {
		const { data: disabledRows, error: disabledErr } = await supabase
			.from('system_module_settings')
			.select('module_key')
			.eq('enabled', false);

		if (disabledErr) {
			if (!isMissingSystemModuleSettingsTable(disabledErr)) throw disabledErr;
		} else {
			const disabledModules = (disabledRows || [])
				.map((row) => String((row as DisabledModuleRow | null)?.module_key || ''))
				.filter(Boolean);

			if (isSystemModuleDisabled(modulo, disabledModules, false)) {
				// Módulo globalmente desabilitado — mas permissão individual ativa prevalece
				// (igual ao comportamento do store de permissões no cliente)
				const modulosConsultaDisabled = Array.from(
					new Set(
						listarModulosComHeranca(modulo).flatMap((label) => {
							const key = MAPA_MODULOS[label];
							return key ? [label, key] : [label];
						})
					)
				);
				const modulosPermitidosDisabled = new Set<string>();
				for (const entry of modulosConsultaDisabled) {
					const normalized = normalizeModuloKey(entry);
					if (normalized) modulosPermitidosDisabled.add(normalized);
				}

				const temPermissaoIndividual = ((accRowsRes.data || []) as AccessRow[]).some((row) => {
					if (!row?.ativo) return false;
					const moduloKey = normalizeModuloKey(row?.modulo);
					if (!moduloKey || !modulosPermitidosDisabled.has(moduloKey)) return false;
					return permLevel(row?.permissao) >= 1;
				});

				if (!temPermissaoIndividual) {
					throw redirect(303, '/negado');
				}
			}
		}
	} catch (disabledCheckErr) {
		logServerError('[hooks.server] falha ao validar modulos globais', disabledCheckErr);
	}

	// Reutiliza acessos ja carregados (sem segunda query a modulo_acesso)
	const modulosConsulta = Array.from(
		new Set(
			listarModulosComHeranca(modulo).flatMap((label) => {
				const key = MAPA_MODULOS[label];
				return key ? [label, key] : [label];
			})
		)
	);

	const modulosPermitidos = new Set<string>();
	for (const entry of modulosConsulta) {
		const normalized = normalizeModuloKey(entry);
		if (normalized) modulosPermitidos.add(normalized);
	}

	// Filtra os acessos ja em memoria — sem nova query ao banco
	const accRowsParaModulo = (accRowsRes.data || []) as AccessRow[];
	const acessosValidos = accRowsParaModulo.filter((row) => {
		if (!row?.ativo) return false;
		const moduloKey = normalizeModuloKey(row?.modulo);
		return moduloKey ? modulosPermitidos.has(moduloKey) : false;
	});

	if (acessosValidos.length === 0) {
		throw redirect(303, '/negado');
	}

	const nivelOrdem: PermissionLevel[] = ['none', 'view', 'create', 'edit', 'delete', 'admin'];
	const melhorPermissao = acessosValidos.reduce(
		(acc, row) => {
			const rawPerm = String(row.permissao || 'none');
			const perm: PermissionLevel = nivelOrdem.includes(rawPerm as PermissionLevel)
				? (rawPerm as PermissionLevel)
				: 'none';
			const idx = nivelOrdem.indexOf(perm);
			if (idx > acc.idx) return { perm, idx };
			return acc;
		},
		{ perm: 'none' as PermissionLevel, idx: 0 }
	);

	if (nivelOrdem.indexOf(melhorPermissao.perm) < 1) {
		throw redirect(303, '/negado');
	}

	return resolve(event);
};

const cacheControlHook: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	// Apenas para paginas HTML — nao afeta assets estaticos
	const contentType = response.headers.get('content-type') || '';
	if (contentType.includes('text/html')) {
		response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
		response.headers.set('Pragma', 'no-cache');
		response.headers.set('Expires', '0');
	}

	return response;
};

export const handle = sequence(supabaseHook, securityHeadersHook, authGuard, cacheControlHook);
